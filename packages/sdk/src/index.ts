import {
  AGENT_CDP_BINDING_NAME,
  AGENT_CDP_RECEIVE_NAME,
  type AgentRuntimeBridgeRequest,
  type AgentRuntimeBridgeResponse,
  type AgentRuntimeCommand,
  type JsAllocationStartResponse,
  type JsAllocationStatusResponse,
  type JsAllocationStopResponse,
  type JsAllocationTimelineStartResponse,
  type JsAllocationTimelineStatusResponse,
  type JsAllocationTimelineStopResponse,
  type JsMemorySampleResponse,
  type JsProfileStatusResponse,
  type MemSnapshotCaptureResponse,
  type NetworkStartResponse,
  type NetworkStatusResponse,
  type NetworkStopResponse,
  type TraceStatusResponse,
  type TraceStopResponse,
} from "@agent-cdp/protocol";

declare global {
  var __agentCdpSend: ((payload: string) => void) | undefined;
  var __agentCdpReceive: ((payload: string) => void) | undefined;
}

function agentCdpGlobals(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const BINDING_POLL_INTERVAL_MS = 25;

export interface AgentRuntimeClientOptions {
  timeoutMs?: number;
  bindingName?: string;
  receiveName?: string;
}

interface PendingRequest {
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class AgentRuntimeClient {
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly timeoutMs: number;
  private readonly bindingName: string;
  private readonly receiveName: string;

  constructor(options: AgentRuntimeClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.bindingName = options.bindingName ?? AGENT_CDP_BINDING_NAME;
    this.receiveName = options.receiveName ?? AGENT_CDP_RECEIVE_NAME;
    this.installReceiver();
  }

  startCpuProfile(options: { name?: string; samplingIntervalUs?: number } = {}): Promise<string> {
    return this.send({
      type: "js-profile-start",
      name: options.name,
      samplingIntervalUs: options.samplingIntervalUs,
    }) as Promise<string>;
  }

  getCpuProfileStatus(): Promise<JsProfileStatusResponse> {
    return this.send({ type: "js-profile-status" }) as Promise<JsProfileStatusResponse>;
  }

  stopCpuProfile(): Promise<string> {
    return this.send({ type: "js-profile-stop" }) as Promise<string>;
  }

  startAllocation(
    options: {
      name?: string;
      samplingIntervalBytes?: number;
      stackDepth?: number;
      includeObjectsCollectedByMajorGC?: boolean;
      includeObjectsCollectedByMinorGC?: boolean;
    } = {},
  ): Promise<JsAllocationStartResponse> {
    return this.send({
      type: "js-allocation-start",
      name: options.name,
      samplingIntervalBytes: options.samplingIntervalBytes,
      stackDepth: options.stackDepth,
      includeObjectsCollectedByMajorGC: options.includeObjectsCollectedByMajorGC,
      includeObjectsCollectedByMinorGC: options.includeObjectsCollectedByMinorGC,
    }) as Promise<JsAllocationStartResponse>;
  }

  getAllocationStatus(): Promise<JsAllocationStatusResponse> {
    return this.send({ type: "js-allocation-status" }) as Promise<JsAllocationStatusResponse>;
  }

  stopAllocation(): Promise<JsAllocationStopResponse> {
    return this.send({ type: "js-allocation-stop" }) as Promise<JsAllocationStopResponse>;
  }

  startAllocationTimeline(options: { name?: string } = {}): Promise<JsAllocationTimelineStartResponse> {
    return this.send({
      type: "js-allocation-timeline-start",
      name: options.name,
    }) as Promise<JsAllocationTimelineStartResponse>;
  }

  getAllocationTimelineStatus(): Promise<JsAllocationTimelineStatusResponse> {
    return this.send({ type: "js-allocation-timeline-status" }) as Promise<JsAllocationTimelineStatusResponse>;
  }

  stopAllocationTimeline(): Promise<JsAllocationTimelineStopResponse> {
    return this.send({ type: "js-allocation-timeline-stop" }) as Promise<JsAllocationTimelineStopResponse>;
  }

  sampleMemoryUsage(options: { label?: string; collectGarbage?: boolean } = {}): Promise<JsMemorySampleResponse> {
    return this.send({
      type: "js-memory-sample",
      label: options.label,
      collectGarbage: options.collectGarbage,
    }) as Promise<JsMemorySampleResponse>;
  }

  captureMemorySnapshot(
    options: { name?: string; collectGarbage?: boolean; filePath?: string } = {},
  ): Promise<MemSnapshotCaptureResponse> {
    return this.send({
      type: "mem-snapshot-capture",
      name: options.name,
      collectGarbage: options.collectGarbage,
      filePath: options.filePath,
    }) as Promise<MemSnapshotCaptureResponse>;
  }

  startNetwork(options: { name?: string; preserveAcrossNavigation?: boolean } = {}): Promise<NetworkStartResponse> {
    return this.send({
      type: "network-start",
      name: options.name,
      preserveAcrossNavigation: options.preserveAcrossNavigation,
    }) as Promise<NetworkStartResponse>;
  }

  getNetworkStatus(): Promise<NetworkStatusResponse> {
    return this.send({ type: "network-status" }) as Promise<NetworkStatusResponse>;
  }

  stopNetwork(): Promise<NetworkStopResponse> {
    return this.send({ type: "network-stop" }) as Promise<NetworkStopResponse>;
  }

  startTrace(): Promise<string> {
    return this.send({ type: "start-trace" }) as Promise<string>;
  }

  getTraceStatus(): Promise<TraceStatusResponse> {
    return this.send({ type: "trace-status" }) as Promise<TraceStatusResponse>;
  }

  stopTrace(): Promise<TraceStopResponse> {
    return this.send({ type: "stop-trace" }) as Promise<TraceStopResponse>;
  }

  private async send(command: AgentRuntimeCommand): Promise<unknown> {
    const binding = await this.waitForBinding();

    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`agent-cdp request ${id} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { timeout, resolve, reject });
      binding(JSON.stringify({ id, command }));
    });
  }

  private async waitForBinding(): Promise<(payload: string) => void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= this.timeoutMs) {
      const binding = agentCdpGlobals()[this.bindingName];
      if (typeof binding === "function") {
        return binding as (payload: string) => void;
      }

      await sleep(BINDING_POLL_INTERVAL_MS);
    }

    throw new Error("agent-cdp runtime bridge is not installed. Select a target with the daemon first.");
  }

  private installReceiver(): void {
    agentCdpGlobals()[this.receiveName] = (payload: string) => {
      this.receive(payload);
    };
  }

  private receive(payload: string): void {
    let response: AgentRuntimeBridgeResponse;
    try {
      response = JSON.parse(payload) as AgentRuntimeBridgeResponse;
    } catch {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error));
    }
  }
}

const defaultClient = new AgentRuntimeClient();

export const cpuProfile = {
  start: (options?: { name?: string; samplingIntervalUs?: number }) => defaultClient.startCpuProfile(options),
  status: () => defaultClient.getCpuProfileStatus(),
  stop: () => defaultClient.stopCpuProfile(),
};

export const allocation = {
  start: (options?: {
    name?: string;
    samplingIntervalBytes?: number;
    stackDepth?: number;
    includeObjectsCollectedByMajorGC?: boolean;
    includeObjectsCollectedByMinorGC?: boolean;
  }) => defaultClient.startAllocation(options),
  status: () => defaultClient.getAllocationStatus(),
  stop: () => defaultClient.stopAllocation(),
};

export const allocationTimeline = {
  start: (options?: { name?: string }) => defaultClient.startAllocationTimeline(options),
  status: () => defaultClient.getAllocationTimelineStatus(),
  stop: () => defaultClient.stopAllocationTimeline(),
};

export const memoryUsage = {
  sample: (options?: { label?: string; collectGarbage?: boolean }) => defaultClient.sampleMemoryUsage(options),
};

export const memorySnapshot = {
  capture: (options?: { name?: string; collectGarbage?: boolean; filePath?: string }) =>
    defaultClient.captureMemorySnapshot(options),
};

export const trace = {
  start: () => defaultClient.startTrace(),
  status: () => defaultClient.getTraceStatus(),
  stop: () => defaultClient.stopTrace(),
};

export const network = {
  start: (options?: { name?: string; preserveAcrossNavigation?: boolean }) => defaultClient.startNetwork(options),
  status: () => defaultClient.getNetworkStatus(),
  stop: () => defaultClient.stopNetwork(),
};

export type {
  AgentRuntimeBridgeRequest,
  JsAllocationStartResponse,
  JsAllocationStatusResponse,
  JsAllocationStopResponse,
  JsAllocationTimelineStartResponse,
  JsAllocationTimelineStatusResponse,
  JsAllocationTimelineStopResponse,
  JsMemorySampleResponse,
  JsProfileStatusResponse,
  MemSnapshotCaptureResponse,
  NetworkStartResponse,
  NetworkStatusResponse,
  NetworkStopResponse,
  TraceStatusResponse,
  TraceStopResponse,
} from "@agent-cdp/protocol";
