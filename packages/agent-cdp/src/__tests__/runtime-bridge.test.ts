import { AGENT_CDP_BINDING_NAME, AGENT_CDP_RECEIVE_NAME } from "@agent-cdp/protocol";
import { vi } from "vitest";

import type { AgentPluginTargetContext, AgentPluginTargetSession } from "../plugin.js";
import { AgentRuntimeBridgePlugin } from "../plugins/runtime-bridge/index.js";
import type { CdpEventMessage, TargetDescriptor } from "../types.js";

class FakeBridgeSession implements AgentPluginTargetSession {
  private listener: ((message: CdpEventMessage) => void) | null = null;
  readonly sent: Array<{ method: string; params?: Record<string, unknown> }> = [];

  readonly target: TargetDescriptor = {
    id: "rn:test:page-1",
    rawId: "page-1",
    title: "Example",
    kind: "react-native",
    description: "Test page",
    webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
    sourceUrl: "http://example.test",
  };

  isConnected(): boolean {
    return true;
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sent.push({ method, params });
    return Promise.resolve(undefined);
  }

  onEvent(listener: (message: CdpEventMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  onDisconnected(_listener: (error?: Error) => void): () => void {
    return () => {};
  }

  emit(message: CdpEventMessage): void {
    this.listener?.(message);
  }
}

function makeContext(session: FakeBridgeSession, pluginId = "runtime-bridge"): AgentPluginTargetContext {
  return { pluginId, session };
}

describe("AgentRuntimeBridgePlugin", () => {
  it("installs the runtime binding and routes bridge requests through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return { ok: true as const, data: "profile-1" };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-profile-stop" } }),
      },
    });
    await Promise.resolve();

    expect(session.sent[0]).toEqual({ method: "Runtime.enable", params: undefined });
    expect(session.sent[1]).toEqual({ method: "Runtime.addBinding", params: { name: AGENT_CDP_BINDING_NAME } });
    expect(relayed).toEqual([{ type: "js-profile-stop" }]);
    expect(session.sent[2]?.method).toBe("Runtime.evaluate");
    expect(String(session.sent[2]?.params?.expression)).toContain(AGENT_CDP_RECEIVE_NAME);
    expect(String(session.sent[2]?.params?.expression)).toContain("profile-1");
  });

  it("routes trace measurement commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return { ok: true as const, data: { active: true, elapsedMs: 12, sessionCount: 0 } };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "trace-status" } }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "trace-status" }]);
    expect(String(session.sent[2]?.params?.expression)).toContain('\\"active\\":true');
  });

  it("routes allocation measurement commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return {
        ok: true as const,
        data: { active: true, activeName: "checkout", elapsedMs: 25, sessionCount: 1 },
      };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-allocation-status" } }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "js-allocation-status" }]);
    expect(String(session.sent[2]?.params?.expression)).toContain('\\"activeName\\":\\"checkout\\"');
  });

  it("routes allocation timeline measurement commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return { ok: true as const, data: "jat_1" };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-allocation-timeline-stop" } }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "js-allocation-timeline-stop" }]);
    expect(String(session.sent[2]?.params?.expression)).toContain("jat_1");
  });

  it("routes network measurement commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return {
        ok: true as const,
        data: {
          attached: true,
          liveRequestCount: 1,
          liveBufferLimit: 200,
          activeSession: { id: "net_1", startedAt: 10, preserveAcrossNavigation: false, requestCount: 1 },
          storedSessionCount: 1,
        },
      };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "network-status" } }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "network-status" }]);
    expect(String(session.sent[2]?.params?.expression)).toContain('\\"id\\":\\"net_1\\"');
  });

  it("routes memory measurement commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return {
        ok: true as const,
        data: {
          sampleId: "jm_1",
          label: "checkout",
          timestamp: 100,
          usedJSHeapSize: 25,
          totalJSHeapSize: 40,
          jsHeapSizeLimit: 256,
          source: "performance.memory",
          collectGarbageRequested: true,
          caveats: [],
        },
      };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-memory-sample", label: "checkout", collectGarbage: true } }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "js-memory-sample", label: "checkout", collectGarbage: true }]);
    expect(String(session.sent[2]?.params?.expression)).toContain('\\"sampleId\\":\\"jm_1\\"');
  });

  it("routes memory snapshot capture commands through the relay", async () => {
    const relayed: unknown[] = [];
    const relay = async (command: unknown) => {
      relayed.push(command);
      return {
        ok: true as const,
        data: {
          snapshotId: "hs_1",
          name: "before-checkout",
          filePath: "/tmp/before-checkout.heapsnapshot",
          capturedAt: 200,
          collectGarbageRequested: true,
          nodeCount: 10,
          totalSelfSize: 20,
          totalRetainedSize: 30,
        },
      };
    };
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({
          id: "1",
          command: { type: "mem-snapshot-capture", name: "before-checkout", collectGarbage: true, filePath: "/tmp/before-checkout.heapsnapshot" },
        }),
      },
    });
    await Promise.resolve();

    expect(relayed).toEqual([{ type: "mem-snapshot-capture", name: "before-checkout", collectGarbage: true, filePath: "/tmp/before-checkout.heapsnapshot" }]);
    expect(String(session.sent[2]?.params?.expression)).toContain('\\"snapshotId\\":\\"hs_1\\"');
  });

  it("reinstalls the runtime binding after execution context resets", async () => {
    const relay = vi.fn(async () => ({ ok: true as const, data: null }));
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({ method: "Runtime.executionContextsCleared", params: {} });
    await Promise.resolve();

    expect(session.sent[2]).toEqual({ method: "Runtime.addBinding", params: { name: AGENT_CDP_BINDING_NAME } });
  });

  it("rejects unsupported bridge commands without relaying", async () => {
    const relay = vi.fn(async () => ({ ok: true as const, data: null }));
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "clear-target" } }),
      },
    });
    await Promise.resolve();

    expect(relay).not.toHaveBeenCalled();
    expect(String(session.sent[2]?.params?.expression)).toContain("Unsupported agent-cdp bridge request");
  });

  it("rejects allocation analysis commands at the runtime bridge boundary", async () => {
    const relay = vi.fn(async () => ({ ok: true as const, data: null }));
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));
    session.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-allocation-summary" } }),
      },
    });
    await Promise.resolve();

    expect(relay).not.toHaveBeenCalled();
    expect(String(session.sent[2]?.params?.expression)).toContain("Unsupported agent-cdp bridge request");
  });

  it("sets state to unsupported-target for non-React-Native targets", async () => {
    const relay = vi.fn(async () => ({ ok: true as const, data: null }));
    const session = new FakeBridgeSession();
    session.target.kind = "chrome";
    const plugin = new AgentRuntimeBridgePlugin(relay);

    await plugin.onTargetSelected(makeContext(session));

    expect(plugin.getState()).toEqual({ kind: "unsupported-target", reason: "only React Native targets are supported" });
    expect(session.sent).toHaveLength(0);
  });

  it("sets state to ready after successful attach and idle after clear", async () => {
    const relay = vi.fn(async () => ({ ok: true as const, data: null }));
    const session = new FakeBridgeSession();
    const plugin = new AgentRuntimeBridgePlugin(relay);

    expect(plugin.getState()).toEqual({ kind: "idle" });
    await plugin.onTargetSelected(makeContext(session));
    expect(plugin.getState()).toEqual({ kind: "ready" });
    await plugin.onTargetCleared({ pluginId: "runtime-bridge", target: session.target, reason: "target-cleared" });
    expect(plugin.getState()).toEqual({ kind: "idle" });
  });
});