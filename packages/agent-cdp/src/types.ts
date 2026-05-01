export interface TargetDescriptor {
  id: string;
  rawId: string;
  title: string;
  kind: "chrome" | "react-native";
  description: string;
  appId?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl: string;
  sourceUrl: string;
  reactNative?: {
    logicalDeviceId: string;
    capabilities: {
      nativePageReloads?: boolean;
      nativeSourceCodeFetching?: boolean;
      supportsMultipleDebuggers?: boolean;
    };
  };
}

export interface DiscoveryOptions {
  url?: string;
}

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

export interface MemorySnapshotSummary {
  chunkCount: number;
  filePath: string;
}

export type SessionState = "disconnected" | "connecting" | "connected";

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
  sessionState: SessionState;
  tracingActive: boolean;
}

export type IpcCommand =
  | { type: "ping" }
  | { type: "status" }
  | { type: "list-targets"; options: DiscoveryOptions }
  | { type: "select-target"; targetId: string; options: DiscoveryOptions }
  | { type: "clear-target" }
  | { type: "list-console-messages"; limit?: number }
  | { type: "get-console-message"; id: number }
  | { type: "start-trace" }
  | { type: "stop-trace"; filePath?: string }
  | { type: "capture-memory"; filePath: string }
  | { type: "js-profile-start"; name?: string; samplingIntervalUs?: number }
  | { type: "js-profile-stop" }
  | { type: "js-profile-status" }
  | { type: "js-profile-list-sessions"; limit?: number; offset?: number }
  | { type: "js-profile-summary"; sessionId?: string }
  | { type: "js-profile-hotspots"; sessionId?: string; limit?: number; offset?: number; sortBy?: string; minSelfMs?: number; includeRuntime?: boolean }
  | { type: "js-profile-hotspot"; sessionId?: string; hotspotId: string; stackLimit?: number }
  | { type: "js-profile-modules"; sessionId?: string; limit?: number; offset?: number; sortBy?: string }
  | { type: "js-profile-stacks"; sessionId?: string; limit?: number; offset?: number; minMs?: number; maxDepth?: number }
  | { type: "js-profile-slice"; sessionId?: string; startMs: number; endMs: number; limit?: number }
  | { type: "js-profile-diff"; baseSessionId: string; compareSessionId: string; limit?: number; minDeltaPct?: number }
  | { type: "js-profile-export"; sessionId?: string }
  | { type: "js-profile-source-maps"; sessionId?: string };

export interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}
