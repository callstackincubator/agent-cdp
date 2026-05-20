import type { TargetDescriptor } from "@agent-cdp/protocol";

import type { CdpEventMessage } from "./types.js";

export type AgentPluginState =
  | { kind: "idle" }
  | { kind: "unsupported-target"; reason: string }
  | { kind: "waiting-for-runtime"; reason: string }
  | { kind: "ready" }
  | { kind: "error"; reason: string };

export interface AgentPluginTargetSession {
  readonly target: TargetDescriptor;

  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  isConnected(): boolean;

  onEvent(listener: (event: CdpEventMessage) => void): () => void;
  onDisconnected(listener: (error?: Error) => void): () => void;
}

export interface AgentPluginCommandContext {
  readonly pluginId: string;
  readonly session: AgentPluginTargetSession | null;

  getState(): AgentPluginState;
}

export interface AgentPluginTargetContext {
  readonly pluginId: string;
  readonly session: AgentPluginTargetSession;
}

export interface AgentPluginDetachContext {
  readonly pluginId: string;
  readonly target: TargetDescriptor | null;
  readonly reason: "target-cleared" | "target-disconnected" | "daemon-stopping";
}

export interface AgentPluginCommand {
  readonly name: string;
  readonly summary: string;
  readonly description?: string;

  execute(context: AgentPluginCommandContext, input?: unknown): Promise<unknown>;
}

export interface AgentPlugin {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string;
  readonly commands: readonly AgentPluginCommand[];

  supportsTarget(target: TargetDescriptor): boolean;
  getState(): AgentPluginState;

  onDaemonStart?(): Promise<void>;
  onDaemonStop?(): Promise<void>;
  onTargetSelected?(context: AgentPluginTargetContext): Promise<void>;
  onTargetReconnected?(context: AgentPluginTargetContext): Promise<void>;
  onTargetCleared?(context: AgentPluginDetachContext): Promise<void>;
  onTargetDisconnected?(context: AgentPluginDetachContext): Promise<void>;
}