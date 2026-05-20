import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentPluginCommandContext, AgentPluginTargetContext, AgentPluginTargetSession } from "../plugin.js";
import { PluginOrchestrator } from "../plugin-orchestrator.js";
import { RozenitePlugin } from "../plugins/rozenite/index.js";
import { DOMAIN_NAME, RUNTIME_GLOBAL } from "../plugins/rozenite/protocol.js";
import type { CdpEventMessage, IpcResponse, TargetDescriptor } from "../types.js";

// ---------------------------------------------------------------------------
// Fake session
// ---------------------------------------------------------------------------

class FakeRozeniteSession implements AgentPluginTargetSession {
  private eventListener: ((message: CdpEventMessage) => void) | null = null;
  private readonly disconnectListeners: ((error?: Error) => void)[] = [];
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

  private readonly bindingName: string;

  constructor(bindingName = "test_binding") {
    this.bindingName = bindingName;
  }

  isConnected(): boolean {
    return true;
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sent.push({ method, params });

    if (method === "Runtime.evaluate") {
      const expr = String(params?.expression ?? "");
      if (expr.includes(`typeof ${RUNTIME_GLOBAL}`)) {
        return Promise.resolve({ result: { value: true } });
      }
      if (expr.includes("BINDING_NAME")) {
        return Promise.resolve({ result: { value: this.bindingName } });
      }
    }
    return Promise.resolve(undefined);
  }

  onEvent(listener: (message: CdpEventMessage) => void): () => void {
    this.eventListener = listener;
    return () => {
      this.eventListener = null;
    };
  }

  onDisconnected(listener: (error?: Error) => void): () => void {
    this.disconnectListeners.push(listener);
    return () => {
      const index = this.disconnectListeners.indexOf(listener);
      if (index !== -1) this.disconnectListeners.splice(index, 1);
    };
  }

  emitEvent(message: CdpEventMessage): void {
    this.eventListener?.(message);
  }

  emitDisconnect(error?: Error): void {
    for (const listener of this.disconnectListeners) {
      listener(error);
    }
  }

  emitBinding(payload: unknown): void {
    this.emitEvent({
      method: "Runtime.bindingCalled",
      params: { name: this.bindingName, payload: JSON.stringify({ domain: DOMAIN_NAME, message: payload }) },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTargetContext(session: FakeRozeniteSession, pluginId = "rozenite"): AgentPluginTargetContext {
  return { pluginId, session };
}

function makeCommandContext(plugin: RozenitePlugin, session: FakeRozeniteSession): AgentPluginCommandContext {
  return {
    pluginId: "rozenite",
    session,
    getState: () => plugin.getState(),
  };
}

async function runCommand(
  plugin: RozenitePlugin,
  name: string,
  session: FakeRozeniteSession,
  input?: unknown
): Promise<IpcResponse> {
  const cmd = (plugin.commands as ReturnType<typeof plugin.commands.find>[]).find((c) => c?.name === name);
  if (!cmd) return { ok: false, error: `Unknown command '${name}'` };
  const ctx = makeCommandContext(plugin, session);
  try {
    const data = await cmd.execute(ctx, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function flushBootstrap(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

const RN_TARGET: TargetDescriptor = {
  id: "rn:test:page-1",
  rawId: "page-1",
  title: "Example",
  kind: "react-native",
  description: "",
  webSocketDebuggerUrl: "ws://example.test/1",
  sourceUrl: "http://example.test",
};

const CHROME_TARGET: TargetDescriptor = {
  ...RN_TARGET,
  id: "chrome:test:page-1",
  kind: "chrome",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RozenitePlugin", () => {
  describe("supportsTarget", () => {
    it("returns true for react-native targets", () => {
      const plugin = new RozenitePlugin();
      expect(plugin.supportsTarget(RN_TARGET)).toBe(true);
    });

    it("returns false for chrome targets", () => {
      const plugin = new RozenitePlugin();
      expect(plugin.supportsTarget(CHROME_TARGET)).toBe(false);
    });
  });

  describe("bootstrap", () => {
    it("transitions to ready after successful bootstrap", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      expect(plugin.getState()).toEqual({ kind: "idle" });
      await plugin.onTargetSelected(makeTargetContext(session));
      expect(plugin.getState()).toEqual({ kind: "waiting-for-runtime", reason: expect.stringContaining(RUNTIME_GLOBAL) });

      await flushBootstrap();

      expect(plugin.getState()).toEqual({ kind: "ready" });
    });

    it("sends agent-session-ready after bootstrap completes", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();

      const sendMessages = session.sent.filter(
        (s) => s.method === "Runtime.evaluate" && String(s.params?.expression).includes("sendMessage")
      );
      expect(sendMessages).toHaveLength(1);
      expect(String(sendMessages[0].params?.expression)).toContain("agent-session-ready");
    });

    it("transitions to error state when dispatcher global times out", async () => {
      vi.useFakeTimers();
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      vi.spyOn(session, "send").mockImplementation((method, params) => {
        session.sent.push({ method, params });
        if (method === "Runtime.evaluate" && String(params?.expression).includes(`typeof ${RUNTIME_GLOBAL}`)) {
          return Promise.resolve({ result: { value: false } });
        }
        return Promise.resolve(undefined);
      });

      await plugin.onTargetSelected(makeTargetContext(session));
      await vi.advanceTimersByTimeAsync(31_000);

      expect(plugin.getState()).toEqual({ kind: "error", reason: expect.stringContaining(RUNTIME_GLOBAL) });
      vi.useRealTimers();
    });

    it("does not transition to error when target is cleared during bootstrap", async () => {
      vi.useFakeTimers();
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      vi.spyOn(session, "send").mockImplementation((method, params) => {
        session.sent.push({ method, params });
        if (method === "Runtime.evaluate" && String(params?.expression).includes(`typeof ${RUNTIME_GLOBAL}`)) {
          return Promise.resolve({ result: { value: false } });
        }
        return Promise.resolve(undefined);
      });

      await plugin.onTargetSelected(makeTargetContext(session));
      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
      await vi.advanceTimersByTimeAsync(31_000);

      expect(plugin.getState()).toEqual({ kind: "idle" });
      vi.useRealTimers();
    });

    it("transitions back to idle after onTargetCleared", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();
      expect(plugin.getState()).toEqual({ kind: "ready" });

      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
      expect(plugin.getState()).toEqual({ kind: "idle" });
    });
  });

  describe("tool registry", () => {
    it("registers tools from register-tool messages with qualified names", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();
      const orchestrator = new PluginOrchestrator([plugin]);

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();

      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: {} }],
      });

      const result = await runCommand(plugin, "tools", session);
      expect(result).toEqual({
        ok: true,
        data: [{ name: "app.myTool", description: "A tool" }],
      });

      // orchestrator referenced to avoid unused variable lint
      expect(orchestrator).toBeDefined();
    });

    it("removes tools from unregister-tool messages", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();

      session.emitBinding({
        type: "register-tool",
        tools: [
          { name: "toolA", description: "A", inputSchema: {} },
          { name: "toolB", description: "B", inputSchema: {} },
        ],
      });
      session.emitBinding({ type: "unregister-tool", toolNames: ["app.toolA"] });

      const result = await runCommand(plugin, "tools", session);
      expect(result).toEqual({
        ok: true,
        data: [{ name: "app.toolB", description: "B" }],
      });
    });

    it("clears registry on disconnect", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeRozeniteSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();

      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: {} }],
      });

      session.emitDisconnect();

      const result = await runCommand(plugin, "status", session);
      expect(result.ok).toBe(true);
      expect((result.data as { toolCount: number }).toolCount).toBe(0);
    });
  });

  describe("commands", () => {
    let plugin: RozenitePlugin;
    let session: FakeRozeniteSession;

    beforeEach(async () => {
      plugin = new RozenitePlugin();
      session = new FakeRozeniteSession();
      await plugin.onTargetSelected(makeTargetContext(session));
      await flushBootstrap();
    });

    afterEach(async () => {
      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
    });

    it("status returns state, toolCount, and target", async () => {
      const result = await runCommand(plugin, "status", session);
      expect(result).toEqual({
        ok: true,
        data: { state: "ready", toolCount: 0, target: session.target },
      });
    });

    it("status works in waiting-for-runtime state (alwaysExecutable)", async () => {
      const plugin2 = new RozenitePlugin();
      const session2 = new FakeRozeniteSession();
      const orchestrator = new PluginOrchestrator([plugin2]);

      void plugin2.onTargetSelected(makeTargetContext(session2));

      // Use orchestrator.dispatch — status has alwaysExecutable so it bypasses state check
      const result = await orchestrator.dispatch("rozenite", "status");
      expect(result.ok).toBe(true);
      expect((result.data as { state: string }).state).toBe("waiting-for-runtime");

      await plugin2.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
    });

    it("tool-schema returns inputSchema for a registered tool", async () => {
      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: { type: "object" } }],
      });

      const result = await runCommand(plugin, "tool-schema", session, { name: "app.myTool" });
      expect(result).toEqual({ ok: true, data: { type: "object" } });
    });

    it("tool-schema returns error for unknown tool", async () => {
      const result = await runCommand(plugin, "tool-schema", session, { name: "app.unknown" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("app.unknown") });
    });

    it("call succeeds and returns tool result", async () => {
      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: {} }],
      });

      let capturedCallId: string | undefined;
      const originalSend = session.send.bind(session);
      vi.spyOn(session, "send").mockImplementation((method, params) => {
        if (method === "Runtime.evaluate") {
          const expr = String(params?.expression ?? "");
          if (expr.includes("tool-call")) {
            // payload is double-JSON-encoded so quotes appear as \" in the expression value
            const match = /\\"callId\\":\\"([a-f0-9-]+)/.exec(expr);
            if (match) capturedCallId = match[1];
          }
        }
        return originalSend(method, params);
      });

      const callPromise = runCommand(plugin, "call", session, { name: "app.myTool", arguments: { x: 1 } });

      await Promise.resolve();
      await Promise.resolve();

      expect(capturedCallId).toBeDefined();
      session.emitBinding({ type: "tool-result", callId: capturedCallId!, success: true, result: { value: 42 } });

      const result = await callPromise;
      expect(result).toEqual({ ok: true, data: { success: true, result: { value: 42 } } });
    });

    it("call returns success:false data for tool-level failure (not an IPC error)", async () => {
      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: {} }],
      });

      let capturedCallId: string | undefined;
      const originalSend = session.send.bind(session);
      vi.spyOn(session, "send").mockImplementation((method, params) => {
        if (method === "Runtime.evaluate") {
          const expr = String(params?.expression ?? "");
          if (expr.includes("tool-call")) {
            const match = /\\"callId\\":\\"([a-f0-9-]+)/.exec(expr);
            if (match) capturedCallId = match[1];
          }
        }
        return originalSend(method, params);
      });

      const callPromise = runCommand(plugin, "call", session, { name: "app.myTool" });

      await Promise.resolve();
      await Promise.resolve();

      expect(capturedCallId).toBeDefined();
      session.emitBinding({ type: "tool-result", callId: capturedCallId!, success: false, error: "something went wrong" });

      const result = await callPromise;
      expect(result).toEqual({ ok: true, data: { success: false, error: "something went wrong" } });
    });

    it("call rejects with IPC error on disconnect", async () => {
      session.emitBinding({
        type: "register-tool",
        tools: [{ name: "myTool", description: "A tool", inputSchema: {} }],
      });

      const callPromise = runCommand(plugin, "call", session, { name: "app.myTool" });

      await Promise.resolve();
      session.emitDisconnect();

      const result = await callPromise;
      expect(result).toEqual({ ok: false, error: expect.stringContaining("disconnected") });
    });

    it("call returns error for unknown tool", async () => {
      const result = await runCommand(plugin, "call", session, { name: "app.unknown" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("app.unknown") });
    });
  });
});