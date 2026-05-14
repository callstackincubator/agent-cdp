import { AGENT_CDP_BINDING_NAME, AGENT_CDP_RECEIVE_NAME } from "@agent-cdp/protocol";
import { vi } from "vitest";

import { AgentRuntimeBridge } from "../bridge/runtime-bridge.js";
import type { AgentCdpCommandDispatcher } from "../command-dispatcher.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeBridgeTransport implements CdpTransport {
  private listener: ((message: CdpEventMessage) => void) | null = null;
  readonly sent: Array<{ method: string; params?: Record<string, unknown> }> = [];

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

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

  emit(message: CdpEventMessage): void {
    this.listener?.(message);
  }
}

function createSession(transport: CdpTransport): RuntimeSession {
  return {
    target: {
      id: "chrome:test:page-1",
      rawId: "page-1",
      title: "Example",
      kind: "chrome",
      description: "Test page",
      webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
      sourceUrl: "http://example.test",
    } satisfies TargetDescriptor,
    transport,
    ensureConnected: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

describe("AgentRuntimeBridge", () => {
  it("installs the runtime binding and routes bridge requests through the dispatcher", async () => {
    const dispatched: unknown[] = [];
    const dispatcher = {
      dispatch: async (command: unknown) => {
        dispatched.push(command);
        return { ok: true, data: "profile-1" };
      },
    } as AgentCdpCommandDispatcher;
    const transport = new FakeBridgeTransport();
    const bridge = new AgentRuntimeBridge(dispatcher);

    await bridge.attach(createSession(transport));
    transport.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "js-profile-stop" } }),
      },
    });
    await Promise.resolve();

    expect(transport.sent[0]).toEqual({ method: "Runtime.enable", params: undefined });
    expect(transport.sent[1]).toEqual({ method: "Runtime.addBinding", params: { name: AGENT_CDP_BINDING_NAME } });
    expect(dispatched).toEqual([{ type: "js-profile-stop" }]);
    expect(transport.sent[2]?.method).toBe("Runtime.evaluate");
    expect(String(transport.sent[2]?.params?.expression)).toContain(AGENT_CDP_RECEIVE_NAME);
    expect(String(transport.sent[2]?.params?.expression)).toContain("profile-1");
  });

  it("routes trace measurement commands through the dispatcher", async () => {
    const dispatched: unknown[] = [];
    const dispatcher = {
      dispatch: async (command: unknown) => {
        dispatched.push(command);
        return { ok: true, data: { active: true, elapsedMs: 12, sessionCount: 0 } };
      },
    } as AgentCdpCommandDispatcher;
    const transport = new FakeBridgeTransport();
    const bridge = new AgentRuntimeBridge(dispatcher);

    await bridge.attach(createSession(transport));
    transport.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "trace-status" } }),
      },
    });
    await Promise.resolve();

    expect(dispatched).toEqual([{ type: "trace-status" }]);
    expect(String(transport.sent[2]?.params?.expression)).toContain('\\"active\\":true');
  });

  it("routes network measurement commands through the dispatcher", async () => {
    const dispatched: unknown[] = [];
    const dispatcher = {
      dispatch: async (command: unknown) => {
        dispatched.push(command);
        return {
          ok: true,
          data: {
            attached: true,
            liveRequestCount: 1,
            liveBufferLimit: 200,
            activeSession: {
              id: "net_1",
              startedAt: 10,
              preserveAcrossNavigation: false,
              requestCount: 1,
            },
            storedSessionCount: 1,
          },
        };
      },
    } as AgentCdpCommandDispatcher;
    const transport = new FakeBridgeTransport();
    const bridge = new AgentRuntimeBridge(dispatcher);

    await bridge.attach(createSession(transport));
    transport.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "network-status" } }),
      },
    });
    await Promise.resolve();

    expect(dispatched).toEqual([{ type: "network-status" }]);
    expect(String(transport.sent[2]?.params?.expression)).toContain('\\"id\\":\\"net_1\\"');
  });

  it("reinstalls the runtime binding after execution context resets", async () => {
    const dispatcher = {
      dispatch: vi.fn(),
    } as unknown as AgentCdpCommandDispatcher;
    const transport = new FakeBridgeTransport();
    const bridge = new AgentRuntimeBridge(dispatcher);

    await bridge.attach(createSession(transport));
    transport.emit({ method: "Runtime.executionContextsCleared", params: {} });
    await Promise.resolve();

    expect(transport.sent[2]).toEqual({ method: "Runtime.addBinding", params: { name: AGENT_CDP_BINDING_NAME } });
  });

  it("rejects unsupported bridge commands without dispatching", async () => {
    const dispatcher = {
      dispatch: vi.fn(),
    } as unknown as AgentCdpCommandDispatcher;
    const transport = new FakeBridgeTransport();
    const bridge = new AgentRuntimeBridge(dispatcher);

    await bridge.attach(createSession(transport));
    transport.emit({
      method: "Runtime.bindingCalled",
      params: {
        name: AGENT_CDP_BINDING_NAME,
        payload: JSON.stringify({ id: "1", command: { type: "clear-target" } }),
      },
    });
    await Promise.resolve();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(String(transport.sent[2]?.params?.expression)).toContain("Unsupported agent-cdp bridge request");
  });
});
