import type {
  CdpTransport,
  DiscoveryOptions,
  RuntimeSession,
  SessionState,
  TargetDescriptor,
  TargetProvider,
} from "./types.js";
import { discoverTargets, normalizeDiscoveryUrl, parseTargetId } from "./discovery.js";

export class PersistentRuntimeSession implements RuntimeSession {
  constructor(
    readonly target: TargetDescriptor,
    readonly transport: CdpTransport,
  ) {}

  ensureConnected(): Promise<void> {
    return this.transport.connect();
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
