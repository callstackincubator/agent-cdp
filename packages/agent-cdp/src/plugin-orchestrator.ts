import type { TargetDescriptor } from "@agent-cdp/protocol";

import type {
  AgentPlugin,
  AgentPluginCommandContext,
  AgentPluginDetachContext,
  AgentPluginState,
  AgentPluginTargetContext,
  AgentPluginTargetSession,
} from "./plugin.js";
import type { CdpEventMessage, IpcResponse, RuntimeSession } from "./types.js";

export class PluginOrchestrator {
  private currentSession: AgentPluginTargetSession | null = null;
  private currentTarget: TargetDescriptor | null = null;

  constructor(private readonly plugins: AgentPlugin[]) {
    this.validateIds();
  }

  async start(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onDaemonStart?.();
    }
  }

  async stop(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onDaemonStop?.();
    }
  }

  async onTargetSelected(session: RuntimeSession): Promise<void> {
    this.currentSession = this.wrapSession(session);
    this.currentTarget = session.target;
    for (const plugin of this.plugins) {
      const context = this.buildTargetContext(plugin.id);
      await plugin.onTargetSelected?.(context);
    }
  }

  async onTargetReconnected(session: RuntimeSession): Promise<void> {
    this.currentSession = this.wrapSession(session);
    this.currentTarget = session.target;
    for (const plugin of this.plugins) {
      const context = this.buildTargetContext(plugin.id);
      await plugin.onTargetReconnected?.(context);
    }
  }

  async onTargetCleared(): Promise<void> {
    const target = this.currentTarget;
    for (const plugin of this.plugins) {
      const context: AgentPluginDetachContext = {
        pluginId: plugin.id,
        target,
        reason: "target-cleared",
      };
      await plugin.onTargetCleared?.(context);
    }
    this.currentSession = null;
    this.currentTarget = null;
  }

  async dispatch(pluginId: string, command: string, input?: unknown): Promise<IpcResponse> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      return { ok: false, error: `Unknown plugin '${pluginId}'` };
    }

    const cmd = plugin.commands.find((c) => c.name === command);
    if (!cmd) {
      return { ok: false, error: `Unknown command '${command}' for plugin '${pluginId}'` };
    }

    if (!cmd.alwaysExecutable) {
      const state = plugin.getState();
      const stateError = this.getStateError(pluginId, state);
      if (stateError) {
        return { ok: false, error: stateError };
      }
    }

    const context = this.buildCommandContext(plugin);
    try {
      const data = await cmd.execute(context, input);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private wrapSession(session: RuntimeSession): AgentPluginTargetSession {
    return {
      target: session.target,
      send: (method, params) => session.transport.send(method, params),
      isConnected: () => session.transport.isConnected(),
      onEvent: (listener) => session.transport.onEvent(listener as (event: CdpEventMessage) => void),
      onDisconnected: (_listener) => () => {},
    };
  }

  private buildTargetContext(pluginId: string): AgentPluginTargetContext {
    if (!this.currentSession) {
      throw new Error(`Plugin '${pluginId}': no active session for target context`);
    }
    return { pluginId, session: this.currentSession };
  }

  private buildCommandContext(plugin: AgentPlugin): AgentPluginCommandContext {
    const session = this.currentSession;
    return {
      pluginId: plugin.id,
      session,
      getState: () => plugin.getState(),
    };
  }

  private getStateError(pluginId: string, state: AgentPluginState): string | null {
    switch (state.kind) {
      case "unsupported-target":
        return `Plugin '${pluginId}' does not support the current target: ${state.reason}`;
      case "waiting-for-runtime":
        return `Plugin '${pluginId}' is waiting for runtime: ${state.reason}`;
      case "error":
        return `Plugin '${pluginId}' is in error state: ${state.reason}`;
      default:
        return null;
    }
  }

  private validateIds(): void {
    const pluginIds = new Set<string>();
    const commandIds = new Set<string>();

    for (const plugin of this.plugins) {
      if (pluginIds.has(plugin.id)) {
        throw new Error(`Duplicate plugin id: '${plugin.id}'`);
      }
      pluginIds.add(plugin.id);

      for (const cmd of plugin.commands) {
        const derivedId = `${plugin.id}.${cmd.name}`;
        if (commandIds.has(derivedId)) {
          throw new Error(`Duplicate derived command id: '${derivedId}'`);
        }
        commandIds.add(derivedId);
      }
    }
  }
}