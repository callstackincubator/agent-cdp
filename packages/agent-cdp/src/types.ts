export type {
  DaemonInfo,
  DiscoveryOptions,
  IpcCommand,
  IpcResponse,
  SessionState,
  StatusInfo,
  TargetDescriptor,
} from "@agent-cdp/protocol";

import type { TargetDescriptor } from "@agent-cdp/protocol";

export interface TargetProvider {
  readonly kind: TargetDescriptor["kind"];
  createTransport(target: TargetDescriptor): CdpTransport;
}

export interface CdpEventMessage {
  method: string;
  params?: Record<string, unknown>;
}

export interface CdpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(listener: (message: CdpEventMessage) => void): () => void;
}

export interface RuntimeSession {
  readonly target: TargetDescriptor;
  readonly transport: CdpTransport;
  ensureConnected(): Promise<void>;
  close(): Promise<void>;
}

export interface ConsoleMessage {
  id: number;
  source: "runtime" | "console" | "log";
  type: string;
  level: string;
  text: string;
  timestamp: number;
  url?: string;
  stackTrace?: string;
}

export interface TraceRecordingSummary {
  eventCount: number;
  filePath?: string;
}
