export const AGENT_CDP_BINDING_NAME = "__agentCdpSend";
export const AGENT_CDP_RECEIVE_NAME = "__agentCdpReceive";

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

export type SessionState = "disconnected" | "connecting" | "connected";

export interface DaemonInfo {
  pid: number;
  socketPath: string;
  startedAt: number;
  version?: string;
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
  | { type: "runtime-eval"; expression: string; awaitPromise?: boolean }
  | { type: "runtime-get-properties"; objectId: string; ownProperties?: boolean; accessorPropertiesOnly?: boolean }
  | { type: "runtime-release-object"; objectId: string }
  | { type: "runtime-release-object-group"; objectGroup: string }
  | { type: "list-console-messages"; limit?: number }
  | { type: "get-console-message"; id: number }
  | { type: "network-status" }
  | { type: "network-start"; name?: string; preserveAcrossNavigation?: boolean }
  | { type: "network-stop" }
  | { type: "network-list-sessions"; limit?: number; offset?: number }
  | { type: "network-summary"; sessionId?: string }
  | {
      type: "network-list";
      sessionId?: string;
      limit?: number;
      offset?: number;
      resourceType?: string;
      status?: string;
      method?: string;
      text?: string;
      minMs?: number;
      maxMs?: number;
      minBytes?: number;
      maxBytes?: number;
    }
  | { type: "network-request"; requestId: string; sessionId?: string }
  | { type: "network-request-headers"; requestId: string; sessionId?: string; name?: string }
  | { type: "network-response-headers"; requestId: string; sessionId?: string; name?: string }
  | { type: "network-request-body"; requestId: string; sessionId?: string; filePath?: string }
  | { type: "network-response-body"; requestId: string; sessionId?: string; filePath?: string }
  | { type: "start-trace" }
  | { type: "stop-trace"; filePath?: string }
  | { type: "trace-status" }
  | { type: "trace-list-sessions"; limit?: number; offset?: number }
  | { type: "trace-summary"; sessionId?: string }
  | { type: "trace-tracks"; sessionId?: string; limit?: number; offset?: number; text?: string; group?: string }
  | {
      type: "trace-entries";
      sessionId?: string;
      track?: string;
      typeFilter?: "measure" | "mark" | "stamp";
      text?: string;
      startMs?: number;
      endMs?: number;
      limit?: number;
      offset?: number;
      sortBy?: "time" | "duration" | "name";
    }
  | { type: "trace-entry"; sessionId?: string; entryId: string }
  | { type: "js-profile-start"; name?: string; samplingIntervalUs?: number }
  | { type: "js-profile-stop" }
  | { type: "js-profile-status" }
  | { type: "js-profile-list-sessions"; limit?: number; offset?: number }
  | { type: "js-profile-summary"; sessionId?: string }
  | {
      type: "js-profile-hotspots";
      sessionId?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      minSelfMs?: number;
      minTotalMs?: number;
      includeRuntime?: boolean;
    }
  | { type: "js-profile-hotspot"; sessionId?: string; hotspotId: string; stackLimit?: number }
  | { type: "js-profile-modules"; sessionId?: string; limit?: number; offset?: number; sortBy?: string }
  | { type: "js-profile-stacks"; sessionId?: string; limit?: number; offset?: number; minMs?: number; maxDepth?: number }
  | { type: "js-profile-slice"; sessionId?: string; startMs: number; endMs: number; limit?: number }
  | { type: "js-profile-diff"; baseSessionId: string; compareSessionId: string; limit?: number; minDeltaPct?: number }
  | { type: "js-profile-export"; sessionId?: string }
  | { type: "js-profile-source-maps"; sessionId?: string }
  | {
      type: "js-allocation-start";
      name?: string;
      samplingIntervalBytes?: number;
      stackDepth?: number;
      includeObjectsCollectedByMajorGC?: boolean;
      includeObjectsCollectedByMinorGC?: boolean;
    }
  | { type: "js-allocation-stop" }
  | { type: "js-allocation-status" }
  | { type: "js-allocation-list-sessions"; limit?: number; offset?: number }
  | { type: "js-allocation-summary"; sessionId?: string }
  | { type: "js-allocation-hotspots"; sessionId?: string; limit?: number; offset?: number; sortBy?: string }
  | { type: "js-allocation-bucketed"; sessionId?: string; limit?: number }
  | { type: "js-allocation-leak-signal"; sessionId?: string }
  | { type: "js-allocation-export"; sessionId?: string; filePath: string }
  | { type: "js-allocation-source-maps"; sessionId?: string }
  | { type: "js-allocation-timeline-start"; name?: string }
  | { type: "js-allocation-timeline-stop" }
  | { type: "js-allocation-timeline-status" }
  | { type: "js-allocation-timeline-list-sessions"; limit?: number; offset?: number }
  | { type: "js-allocation-timeline-summary"; sessionId?: string }
  | { type: "js-allocation-timeline-buckets"; sessionId?: string; limit?: number }
  | { type: "js-allocation-timeline-hotspots"; sessionId?: string; limit?: number; offset?: number }
  | { type: "js-allocation-timeline-leak-signal"; sessionId?: string }
  | { type: "js-allocation-timeline-export"; sessionId?: string; filePath: string }
  | { type: "js-allocation-timeline-source-maps"; sessionId?: string }
  | { type: "mem-snapshot-capture"; name?: string; collectGarbage?: boolean; filePath?: string }
  | { type: "mem-snapshot-load"; filePath: string; name?: string }
  | { type: "mem-snapshot-list" }
  | { type: "mem-snapshot-summary"; snapshotId?: string }
  | { type: "mem-snapshot-classes"; snapshotId?: string; sortBy?: string; limit?: number; offset?: number; filter?: string }
  | { type: "mem-snapshot-class"; classId: string; snapshotId?: string }
  | { type: "mem-snapshot-instances"; classId: string; snapshotId?: string; limit?: number; offset?: number; sortBy?: string }
  | { type: "mem-snapshot-instance"; nodeId: number; snapshotId?: string }
  | { type: "mem-snapshot-retainers"; nodeId: number; snapshotId?: string; depth?: number; limit?: number }
  | { type: "mem-snapshot-diff"; baseSnapshotId: string; compareSnapshotId: string; sortBy?: string; limit?: number }
  | {
      type: "mem-snapshot-leak-triplet";
      baselineSnapshotId: string;
      actionSnapshotId: string;
      cleanupSnapshotId: string;
      limit?: number;
    }
  | { type: "mem-snapshot-leak-candidates"; snapshotId?: string; limit?: number }
  | { type: "js-memory-sample"; label?: string; collectGarbage?: boolean }
  | { type: "js-memory-list"; limit?: number; offset?: number }
  | { type: "js-memory-summary" }
  | { type: "js-memory-diff"; baseSampleId: string; compareSampleId: string }
  | { type: "js-memory-trend"; limit?: number }
  | { type: "js-memory-leak-signal"; sinceSampleId?: string };

export type IpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; data?: unknown };

export type AgentRuntimeMeasurementCommand = Extract<
  IpcCommand,
  | { type: "js-profile-start" }
  | { type: "js-profile-status" }
  | { type: "js-profile-stop" }
  | { type: "network-start" }
  | { type: "network-status" }
  | { type: "network-stop" }
  | { type: "start-trace" }
  | { type: "trace-status" }
  | { type: "stop-trace" }
>;

export type AgentRuntimeCommand = AgentRuntimeMeasurementCommand;

export interface AgentRuntimeBridgeRequest {
  id: string;
  command: AgentRuntimeCommand;
}

export type AgentRuntimeBridgeResponse =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: string };

export type JsProfileStartResponse = string;
export type JsProfileStopResponse = string;
export interface JsProfileStatusResponse {
  active: boolean;
  activeName?: string;
  elapsedMs: number;
  sessionCount: number;
}

export type TraceStartResponse = string;
export interface TraceStatusResponse {
  active: boolean;
  elapsedMs: number | null;
  sessionCount: number;
}

export type NetworkStartResponse = string;
export type NetworkStopResponse = string;
export interface NetworkStatusResponse {
  attached: boolean;
  liveRequestCount: number;
  liveBufferLimit: number;
  activeSession: {
    id: string;
    name?: string;
    startedAt: number;
    preserveAcrossNavigation: boolean;
    requestCount: number;
  } | null;
  storedSessionCount: number;
}

export interface TraceStopResponse {
  sessionId: string;
  eventCount: number;
  filePath?: string;
  trackCount: number;
  entryCount: number;
  durationMs: number;
}
