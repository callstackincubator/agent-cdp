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
    const request = JSON.parse(sent[0] || "{}");
    (agentCdpGlobals()[AGENT_CDP_RECEIVE_NAME] as (payload: string) => void)(
      JSON.stringify({ id: request.id, ok: true, data: "profile-1" }),
    );

    await expect(promise).resolves.toBe("profile-1");
    expect(request.command).toEqual({ type: "js-profile-stop" });
  });

  it("rejects when the runtime bridge is unavailable", async () => {
    const client = new AgentRuntimeClient();

    await expect(client.getCpuProfileStatus()).rejects.toThrow("runtime bridge is not installed");
  });

  it("rejects timed out requests", async () => {
    vi.useFakeTimers();
    agentCdpGlobals()[AGENT_CDP_BINDING_NAME] = () => undefined;
    const client = new AgentRuntimeClient({ timeoutMs: 5 });

    const promise = client.getCpuProfileStatus();
    vi.advanceTimersByTime(5);

    await expect(promise).rejects.toThrow("timed out");
  });
});
