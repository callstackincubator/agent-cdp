import { AGENT_CDP_BINDING_NAME, AGENT_CDP_RECEIVE_NAME } from "@agent-cdp/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentRuntimeClient } from "./index.js";

function agentCdpGlobals(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

describe("AgentRuntimeClient", () => {
  afterEach(() => {
    delete agentCdpGlobals()[AGENT_CDP_BINDING_NAME];
    delete agentCdpGlobals()[AGENT_CDP_RECEIVE_NAME];
    vi.useRealTimers();
  });

  it("sends cpu profile commands and resolves bridge responses", async () => {
    const sent: string[] = [];
    agentCdpGlobals()[AGENT_CDP_BINDING_NAME] = (payload: string) => {
      sent.push(payload);
    };
    const client = new AgentRuntimeClient();

    const promise = client.stopCpuProfile();
    await Promise.resolve();
    const request = JSON.parse(sent[0] || "{}");
    (agentCdpGlobals()[AGENT_CDP_RECEIVE_NAME] as (payload: string) => void)(
      JSON.stringify({ id: request.id, ok: true, data: "profile-1" }),
    );

    await expect(promise).resolves.toBe("profile-1");
    expect(request.command).toEqual({ type: "js-profile-stop" });
  });

  it("sends trace commands and resolves typed bridge responses", async () => {
    const sent: string[] = [];
    agentCdpGlobals()[AGENT_CDP_BINDING_NAME] = (payload: string) => {
      sent.push(payload);
    };
    const client = new AgentRuntimeClient();

    const promise = client.stopTrace();
    await Promise.resolve();
    const request = JSON.parse(sent[0] || "{}");
    (agentCdpGlobals()[AGENT_CDP_RECEIVE_NAME] as (payload: string) => void)(
      JSON.stringify({
        id: request.id,
        ok: true,
        data: { sessionId: "trace-1", eventCount: 3, trackCount: 1, entryCount: 2, durationMs: 25 },
      }),
    );

    await expect(promise).resolves.toEqual({
      sessionId: "trace-1",
      eventCount: 3,
      trackCount: 1,
      entryCount: 2,
      durationMs: 25,
    });
    expect(request.command).toEqual({ type: "stop-trace" });
  });

  it("rejects when the runtime bridge is unavailable", async () => {
    vi.useFakeTimers();
    const client = new AgentRuntimeClient();
    const promise = client.getCpuProfileStatus();
    const assertion = expect(promise).rejects.toThrow("runtime bridge is not installed");
    await vi.advanceTimersByTimeAsync(10_025);

    await assertion;
  });

  it("waits for the runtime bridge to reappear before sending", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const client = new AgentRuntimeClient({ timeoutMs: 100 });

    const promise = client.getTraceStatus();
    await vi.advanceTimersByTimeAsync(50);
    agentCdpGlobals()[AGENT_CDP_BINDING_NAME] = (payload: string) => {
      sent.push(payload);
    };
    await vi.advanceTimersByTimeAsync(25);

    const request = JSON.parse(sent[0] || "{}");
    (agentCdpGlobals()[AGENT_CDP_RECEIVE_NAME] as (payload: string) => void)(
      JSON.stringify({ id: request.id, ok: true, data: { active: true, elapsedMs: 50, sessionCount: 1 } }),
    );

    await expect(promise).resolves.toEqual({ active: true, elapsedMs: 50, sessionCount: 1 });
    expect(request.command).toEqual({ type: "trace-status" });
  });

  it("rejects timed out requests", async () => {
    vi.useFakeTimers();
    agentCdpGlobals()[AGENT_CDP_BINDING_NAME] = () => undefined;
    const client = new AgentRuntimeClient({ timeoutMs: 5 });

    const promise = client.getCpuProfileStatus();
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5);

    await assertion;
  });
});
