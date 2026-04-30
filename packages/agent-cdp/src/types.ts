export interface TargetDescriptor {
  id: string;
  title: string;
  kind: "chrome" | "react-native";
}

export interface TargetProvider {
  readonly name: string;
  listTargets(): Promise<TargetDescriptor[]>;
}

export interface CdpEventMessage {
  method: string;
  params?: Record<string, unknown>;
}

export interface CdpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(listener: (message: CdpEventMessage) => void): () => void;
}

export interface RuntimeSession {
  readonly target: TargetDescriptor;
  readonly transport: CdpTransport;
  ensureConnected(): Promise<void>;
  close(): Promise<void>;
}

export interface DaemonInfo {
  pid: number;
  socketPath: string;
  startedAt: number;
  buildMtime?: number;
}

export interface StatusInfo {
  daemonRunning: boolean;
  uptime: number;
  selectedTarget: TargetDescriptor | null;
  providerCount: number;
}

export type IpcCommand = { type: "ping" } | { type: "status" };

export interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}
