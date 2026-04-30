import type {
  CdpTransport,
  DiscoveryOptions,
  RuntimeSession,
  SessionState,
  TargetDescriptor,
  TargetProvider,
} from "./types.js";

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

  constructor(private readonly providers: TargetProvider[]) {}

  async listTargets(options: DiscoveryOptions): Promise<TargetDescriptor[]> {
    const targets: TargetDescriptor[] = [];

    for (const provider of this.providers) {
      const sourceUrl = provider.kind === "chrome" ? options.chromeUrl : options.reactNativeUrl;
      if (!sourceUrl) {
        continue;
      }
      const providerTargets = await provider.listTargets(sourceUrl);
      targets.push(...providerTargets);
    }

    return targets;
  }

  async selectTarget(targetId: string, options: DiscoveryOptions): Promise<TargetDescriptor> {
    const targets = await this.listTargets(options);
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
    await session.close();
  }

  getSelectedTarget(): TargetDescriptor | null {
    return this.session?.target || null;
  }

  getSessionState(): SessionState {
    return this.sessionState;
  }
}
