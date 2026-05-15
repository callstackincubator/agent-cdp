import type {
  CdpTransport,
  DiscoveryOptions,
  RuntimeSession,
  RuntimeSessionMetadata,
  SessionState,
  TargetDescriptor,
  TargetSessionClockCalibration,
  TargetProvider,
} from "./types.js";
import { discoverTargets, normalizeDiscoveryUrl, parseTargetId } from "./discovery.js";

interface RuntimeEvaluateResponse {
  result?: {
    value?: {
      monotonic?: unknown;
      timeOrigin?: unknown;
      wall?: unknown;
    };
  };
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
    };
  };
}

const CLOCK_CALIBRATION_EXPRESSION = `(() => {
  const perf = globalThis.performance;
  const monotonic = typeof perf?.now === "function" ? perf.now() : null;
  const timeOrigin = typeof perf?.timeOrigin === "number" ? perf.timeOrigin : null;
  const wall = typeof Date.now === "function" ? Date.now() : null;
  return { monotonic, timeOrigin, wall };
})()`;

export class PersistentRuntimeSession implements RuntimeSession {
  metadata: RuntimeSessionMetadata = {
    connectedAt: 0,
    clockCalibration: createUnavailableCalibration(0, 0, "Session has not connected yet"),
  };

  constructor(
    readonly target: TargetDescriptor,
    readonly transport: CdpTransport,
  ) {}

  async ensureConnected(): Promise<void> {
    await this.transport.connect();
    const clockCalibration = await calibrateTargetSessionClock(this.transport);
    this.metadata = {
      connectedAt: clockCalibration.hostResponseTimeMs,
      clockCalibration,
    };
  }

  close(): Promise<void> {
    return this.transport.disconnect();
  }
}

export class SessionManager {
  private session: RuntimeSession | null = null;
  private sessionState: SessionState = "disconnected";
  private selectedOptions: DiscoveryOptions | null = null;

  constructor(
    private readonly providers: TargetProvider[],
    private readonly discoverTargetsImpl: (options: DiscoveryOptions) => Promise<TargetDescriptor[]> = discoverTargets,
  ) {}

  async listTargets(options: DiscoveryOptions): Promise<TargetDescriptor[]> {
    return this.discoverTargetsImpl(options);
  }

  async selectTarget(targetId: string, options: DiscoveryOptions): Promise<TargetDescriptor> {
    const resolvedOptions = this.resolveSelectionOptions(targetId, options);
    const targets = await this.listTargets(resolvedOptions);
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    const provider = this.providers.find((candidate) => candidate.kind === target.kind);
    if (!provider) {
      throw new Error(`No provider available for ${target.kind}`);
    }

    await this.clearTarget();
    this.sessionState = "connecting";

    const session = new PersistentRuntimeSession(target, provider.createTransport(target));

    try {
      await session.ensureConnected();
      this.session = session;
      this.sessionState = "connected";
      this.selectedOptions = resolvedOptions;
      return target;
    } catch (error) {
      this.sessionState = "disconnected";
      await session.close().catch(() => undefined);
      throw error;
    }
  }

  async clearTarget(): Promise<void> {
    this.sessionState = "disconnected";
    if (!this.session) {
      return;
    }

    const session = this.session;
    this.session = null;
    this.selectedOptions = null;
    await session.close();
  }

  getSelectedTarget(): TargetDescriptor | null {
    return this.session?.target || null;
  }

  getSession(): RuntimeSession | null {
    return this.session;
  }

  getSessionState(): SessionState {
    if (this.session && !this.session.transport.isConnected()) {
      this.sessionState = "disconnected";
    }
    return this.sessionState;
  }

  async reconnectSelectedTarget(): Promise<TargetDescriptor | null> {
    const session = this.session;
    if (!session || !this.selectedOptions) {
      return null;
    }

    if (session.transport.isConnected()) {
      this.sessionState = "connected";
      return session.target;
    }

    const target = await this.findReconnectTarget(session.target, this.selectedOptions);
    if (!target) {
      this.sessionState = "disconnected";
      return null;
    }

    const provider = this.providers.find((candidate) => candidate.kind === target.kind);
    if (!provider) {
      this.sessionState = "disconnected";
      return null;
    }

    const nextSession = new PersistentRuntimeSession(target, provider.createTransport(target));
    await nextSession.ensureConnected();
    this.session = nextSession;
    this.sessionState = "connected";
    return target;
  }

  private async findReconnectTarget(
    currentTarget: TargetDescriptor,
    options: DiscoveryOptions,
  ): Promise<TargetDescriptor | null> {
    const targets = await this.listTargets(options);

    if (currentTarget.kind !== "react-native") {
      return targets.find((candidate) => candidate.id === currentTarget.id) || null;
    }

    const logicalDeviceId = currentTarget.reactNative?.logicalDeviceId;
    if (!logicalDeviceId) {
      return targets.find((candidate) => candidate.id === currentTarget.id) || null;
    }

    return (
      targets.find((candidate) => {
        return (
          candidate.kind === "react-native" &&
          candidate.reactNative?.logicalDeviceId === logicalDeviceId &&
          candidate.appId === currentTarget.appId
        );
      }) || null
    );
  }

  private resolveSelectionOptions(targetId: string, options: DiscoveryOptions): DiscoveryOptions {
    const parsedTarget = parseTargetId(targetId);
    const resolvedUrl = parsedTarget.sourceUrl;

    if (!options.url) {
      return { url: resolvedUrl };
    }

    const normalizedOptionUrl = normalizeDiscoveryUrl(options.url);
    if (normalizedOptionUrl !== resolvedUrl) {
      throw new Error(`Target id source does not match --url: ${targetId}`);
    }

    return { url: normalizedOptionUrl };
  }
}

function createUnavailableCalibration(
  hostRequestTimeMs: number,
  hostResponseTimeMs: number,
  reason: string,
): TargetSessionClockCalibration {
  const hostMidpointTimeMs = Math.round((hostRequestTimeMs + hostResponseTimeMs) / 2);
  return {
    state: "unavailable",
    hostRequestTimeMs,
    hostResponseTimeMs,
    hostMidpointTimeMs,
    roundTripTimeMs: Math.max(0, hostResponseTimeMs - hostRequestTimeMs),
    reason,
  };
}

async function calibrateTargetSessionClock(transport: CdpTransport): Promise<TargetSessionClockCalibration> {
  const hostRequestTimeMs = Date.now();

  try {
    const response = (await transport.send("Runtime.evaluate", {
      expression: CLOCK_CALIBRATION_EXPRESSION,
      returnByValue: true,
      silent: true,
    })) as RuntimeEvaluateResponse;
    const hostResponseTimeMs = Date.now();

    if (response.exceptionDetails) {
      return createUnavailableCalibration(
        hostRequestTimeMs,
        hostResponseTimeMs,
        response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime evaluation failed",
      );
    }

    const value = response.result?.value;
    const targetMonotonicTimeMs = readFiniteNumber(value?.monotonic);
    if (targetMonotonicTimeMs === null) {
      return createUnavailableCalibration(
        hostRequestTimeMs,
        hostResponseTimeMs,
        "Target runtime did not provide performance.now()",
      );
    }

    const targetTimeOriginMs = readFiniteNumber(value?.timeOrigin);
    const targetWallTimeMs = readFiniteNumber(value?.wall) ?? deriveTargetWallTime(targetTimeOriginMs, targetMonotonicTimeMs);
    const hostMidpointTimeMs = Math.round((hostRequestTimeMs + hostResponseTimeMs) / 2);

    return {
      state: "calibrated",
      hostRequestTimeMs,
      hostResponseTimeMs,
      hostMidpointTimeMs,
      roundTripTimeMs: Math.max(0, hostResponseTimeMs - hostRequestTimeMs),
      targetMonotonicTimeMs,
      targetTimeOriginMs: targetTimeOriginMs ?? undefined,
      targetWallTimeMs: targetWallTimeMs ?? undefined,
    };
  } catch (error) {
    const hostResponseTimeMs = Date.now();
    return createUnavailableCalibration(
      hostRequestTimeMs,
      hostResponseTimeMs,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function deriveTargetWallTime(targetTimeOriginMs: number | null, targetMonotonicTimeMs: number): number | null {
  return targetTimeOriginMs === null ? null : targetTimeOriginMs + targetMonotonicTimeMs;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
