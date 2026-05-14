import {
  AGENT_CDP_BINDING_NAME,
  AGENT_CDP_RECEIVE_NAME,
  type AgentRuntimeBridgeResponse,
  type AgentRuntimeCommand,
  type JsProfileStatusResponse,
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

export const trace = {
  start: () => defaultClient.startTrace(),
  status: () => defaultClient.getTraceStatus(),
  stop: () => defaultClient.stopTrace(),
};

export type { JsProfileStatusResponse, TraceStatusResponse, TraceStopResponse } from "@agent-cdp/protocol";
