import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CdpEventMessage } from "../types.js";
import type {
  AgentPluginCommandContext,
  AgentPluginTargetContext,
  AgentPluginTargetSession,
} from "../plugin.js";
import { PluginOrchestrator } from "../plugin-orchestrator.js";
import { RozenitePlugin } from "../plugins/rozenite/index.js";
import { AGENT_PLUGIN_ID, ROZENITE_DOMAIN } from "../plugins/rozenite/protocol.js";
import type { IpcResponse, TargetDescriptor } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINDING_NAME = "__CHROME_DEVTOOLS_FRONTEND_BINDING__";

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const RN_TARGET: TargetDescriptor = {
  id: "react-native:bG9jYWxob3N0OjgwODE:page-1",
  rawId: "page-1",
  title: "Example",
  kind: "react-native",
  description: "",
  webSocketDebuggerUrl: "ws://localhost:8081/devtools/page/page-1",
  sourceUrl: "http://localhost:8081",
  reactNative: { logicalDeviceId: "test-device-id", capabilities: {} },
};

const CHROME_TARGET: TargetDescriptor = {
  ...RN_TARGET,
  id: "chrome:bG9jYWxob3N0OjgwODE:page-1",
  kind: "chrome",
};

// ---------------------------------------------------------------------------
// Fake session
// ---------------------------------------------------------------------------

class FakeSession implements AgentPluginTargetSession {
  readonly target: TargetDescriptor;
  private readonly eventListeners: Array<(event: CdpEventMessage) => void> = [];
  private readonly disconnectListeners: Array<(error?: Error) => void> = [];
  private connected = true;

  readonly sendHistory: Array<{ method: string; params?: Record<string, unknown> }> = [];
  sendImpl: (method: string, params?: Record<string, unknown>) => Promise<unknown> = () =>
    Promise.resolve({});

  constructor(target: TargetDescriptor = RN_TARGET) {
    this.target = target;
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sendHistory.push({ method, params });
    return this.sendImpl(method, params);
  }

  onEvent(listener: (event: CdpEventMessage) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const i = this.eventListeners.indexOf(listener);
      if (i >= 0) this.eventListeners.splice(i, 1);
    };
  }

  onDisconnected(listener: (error?: Error) => void): () => void {
    this.disconnectListeners.push(listener);
    return () => {
      const i = this.disconnectListeners.indexOf(listener);
      if (i >= 0) this.disconnectListeners.splice(i, 1);
    };
  }

  emitEvent(event: CdpEventMessage): void {
    for (const listener of [...this.eventListeners]) listener(event);
  }

  emitDisconnect(error?: Error): void {
    this.connected = false;
    for (const listener of [...this.disconnectListeners]) listener(error);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap mock
// ---------------------------------------------------------------------------

const { mockRunBootstrap } = vi.hoisted(() => ({
  mockRunBootstrap: vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("__CHROME_DEVTOOLS_FRONTEND_BINDING__"),
}));

vi.mock("../plugins/rozenite/bootstrap.js", () => ({
  runBootstrap: mockRunBootstrap,
}));

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function makeRozeniteEvent(type: string, payload: unknown): CdpEventMessage {
  return {
    method: "Runtime.bindingCalled",
    params: {
      name: BINDING_NAME,
      payload: JSON.stringify({
        domain: ROZENITE_DOMAIN,
        message: { pluginId: AGENT_PLUGIN_ID, type, payload },
      }),
    },
  };
}

const ECHO_TOOL = { name: "app.echo", description: "Echoes text", inputSchema: { type: "object" } };
const TS_TOOL = { name: "app.getTimestamp", description: "Returns timestamp", inputSchema: {} };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTargetContext(session: FakeSession): AgentPluginTargetContext {
  return { pluginId: "rozenite", session };
}

function makeCommandContext(
  plugin: RozenitePlugin,
  session: FakeSession | null,
): AgentPluginCommandContext {
  return {
    pluginId: "rozenite",
    session,
    getState: () => plugin.getState(),
  };
}

async function runCommand(
  plugin: RozenitePlugin,
  name: string,
  session: FakeSession | null,
  input?: unknown,
): Promise<IpcResponse> {
  const cmd = (plugin.commands as ReturnType<typeof plugin.commands.find>[]).find(
    (c) => c?.name === name,
  );
  if (!cmd) return { ok: false, error: `Unknown command '${name}'` };
  const ctx = makeCommandContext(plugin, session);
  try {
    const data = await cmd.execute(ctx, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function flushAttach(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RozenitePlugin", () => {
  describe("supportsTarget", () => {
    it("returns true for react-native targets", () => {
      const plugin = new RozenitePlugin();
      expect(plugin.supportsTarget(RN_TARGET)).toBe(true);
    });

    it("returns true for chrome targets", () => {
      const plugin = new RozenitePlugin();
      expect(plugin.supportsTarget(CHROME_TARGET)).toBe(true);
    });
  });

  describe("connect", () => {
    afterEach(() => {
      mockRunBootstrap.mockResolvedValue(BINDING_NAME);
    });

    it("transitions to ready after successful bootstrap", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      expect(plugin.getState()).toEqual({ kind: "idle" });
      await plugin.onTargetSelected(makeTargetContext(session));
      expect(plugin.getState()).toEqual({
        kind: "waiting-for-runtime",
        reason: expect.any(String),
      });

      await flushAttach();

      expect(plugin.getState()).toEqual({ kind: "ready" });
    });

    it("calls initializeDomain and agent-session-ready after bootstrap", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushAttach();

      const initCall = session.sendHistory.find(
        (c) =>
          c.method === "Runtime.evaluate" &&
          typeof c.params?.expression === "string" &&
          (c.params.expression as string).includes("initializeDomain"),
      );
      expect(initCall).toBeDefined();
      const readyCall = session.sendHistory.find(
        (c) =>
          c.method === "Runtime.evaluate" &&
          typeof c.params?.expression === "string" &&
          (c.params.expression as string).includes("agent-session-ready"),
      );
      expect(readyCall).toBeDefined();
    });

    it("transitions to error when bootstrap rejects", async () => {
      mockRunBootstrap.mockRejectedValueOnce(new Error("Bootstrap failed"));

      const plugin = new RozenitePlugin();
      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushAttach();

      expect(plugin.getState()).toEqual({ kind: "error", reason: "Bootstrap failed" });
    });

    it("does not transition to error when target is cleared during bootstrap", async () => {
      mockRunBootstrap.mockImplementationOnce(() => new Promise(() => {}));

      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await plugin.onTargetCleared({
        pluginId: "rozenite",
        target: RN_TARGET,
        reason: "target-cleared",
      });

      await flushAttach();
      expect(plugin.getState()).toEqual({ kind: "idle" });
    });

    it("transitions back to idle after onTargetCleared", async () => {
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushAttach();
      expect(plugin.getState()).toEqual({ kind: "ready" });

      await plugin.onTargetCleared({
        pluginId: "rozenite",
        target: RN_TARGET,
        reason: "target-cleared",
      });
      expect(plugin.getState()).toEqual({ kind: "idle" });
    });

    it("registers event listener before bootstrap completes", async () => {
      // The event listener must be registered synchronously (before the async bootstrap) so
      // early binding events are not missed.
      let bootstrapResolved = false;
      mockRunBootstrap.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              bootstrapResolved = true;
              resolve(BINDING_NAME);
            }, 10),
          ),
      );

      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      // Don't await — just kick off
      void plugin.onTargetSelected(makeTargetContext(session));

      // The listener is registered synchronously (before the first await in onTargetSelected),
      // so it's already in place even before bootstrap resolves.
      expect(bootstrapResolved).toBe(false);
      expect(
        (session as unknown as { eventListeners: unknown[] })["eventListeners"].length,
      ).toBeGreaterThan(0);
    });
  });

  describe("tool registration via binding events", () => {
    let plugin: RozenitePlugin;
    let session: FakeSession;

    beforeEach(async () => {
      plugin = new RozenitePlugin();
      session = new FakeSession();
      await plugin.onTargetSelected(makeTargetContext(session));
      await flushAttach();
    });

    afterEach(async () => {
      await plugin.onTargetCleared({
        pluginId: "rozenite",
        target: RN_TARGET,
        reason: "target-cleared",
      });
      mockRunBootstrap.mockResolvedValue(BINDING_NAME);
    });

    it("registers tools from register-tool event", () => {
      session.emitEvent(makeRozeniteEvent("register-tool", { tools: [ECHO_TOOL, TS_TOOL] }));
      expect(plugin.getState()).toEqual({ kind: "ready" });
    });

    it("unregisters tools from unregister-tool event", () => {
      session.emitEvent(makeRozeniteEvent("register-tool", { tools: [ECHO_TOOL, TS_TOOL] }));
      session.emitEvent(makeRozeniteEvent("unregister-tool", { toolNames: ["app.echo"] }));
    });

    it("ignores binding events with non-rozenite domain", () => {
      session.emitEvent({
        method: "Runtime.bindingCalled",
        params: {
          name: BINDING_NAME,
          payload: JSON.stringify({ domain: "react-devtools", message: {} }),
        },
      });
      expect(plugin.getState()).toEqual({ kind: "ready" });
    });

    it("ignores binding events with wrong pluginId", () => {
      session.emitEvent({
        method: "Runtime.bindingCalled",
        params: {
          name: BINDING_NAME,
          payload: JSON.stringify({
            domain: ROZENITE_DOMAIN,
            message: { pluginId: "other-plugin", type: "register-tool", payload: { tools: [] } },
          }),
        },
      });
      expect(plugin.getState()).toEqual({ kind: "ready" });
    });
  });

  describe("commands", () => {
    let plugin: RozenitePlugin;
    let session: FakeSession;

    beforeEach(async () => {
      plugin = new RozenitePlugin();
      session = new FakeSession();
      await plugin.onTargetSelected(makeTargetContext(session));
      await flushAttach();
      session.emitEvent(makeRozeniteEvent("register-tool", { tools: [ECHO_TOOL, TS_TOOL] }));
    });

    afterEach(async () => {
      await plugin.onTargetCleared({
        pluginId: "rozenite",
        target: RN_TARGET,
        reason: "target-cleared",
      });
      mockRunBootstrap.mockResolvedValue(BINDING_NAME);
    });

    it("status returns state, toolCount, and target", async () => {
      const result = await runCommand(plugin, "status", session);
      expect(result).toEqual({
        ok: true,
        data: { state: "ready", toolCount: 2, target: RN_TARGET },
      });
    });

    it("status works in waiting-for-runtime state (alwaysExecutable)", async () => {
      mockRunBootstrap.mockImplementationOnce(() => new Promise(() => {}));

      const plugin2 = new RozenitePlugin();
      const session2 = new FakeSession();
      const orchestrator = new PluginOrchestrator([plugin2]);

      void plugin2.onTargetSelected(makeTargetContext(session2));

      const result = await orchestrator.dispatch("rozenite", "status");
      expect(result.ok).toBe(true);
      expect((result.data as { state: string }).state).toBe("waiting-for-runtime");
      expect((result.data as { toolCount: number }).toolCount).toBe(0);

      await plugin2.onTargetCleared({
        pluginId: "rozenite",
        target: RN_TARGET,
        reason: "target-cleared",
      });
    });

    it("tools returns list of tool names and descriptions", async () => {
      const result = await runCommand(plugin, "tools", session);
      expect(result).toEqual({
        ok: true,
        data: [
          { name: "app.echo", description: "Echoes text" },
          { name: "app.getTimestamp", description: "Returns timestamp" },
        ],
      });
    });

    it("tool-schema returns inputSchema for a registered tool", async () => {
      const result = await runCommand(plugin, "tool-schema", session, { name: "app.echo" });
      expect(result).toEqual({ ok: true, data: { type: "object" } });
    });

    it("tool-schema returns error for unknown tool", async () => {
      const result = await runCommand(plugin, "tool-schema", session, { name: "unknown" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("unknown") });
    });

    it("call sends tool-call and resolves when tool-result arrives", async () => {
      const callPromise = runCommand(plugin, "call", session, {
        name: "app.echo",
        arguments: { text: "hi" },
      });

      await Promise.resolve(); // let the send happen

      // Find the callId from the sendDomainMessage evaluate call
      const callEval = session.sendHistory.find(
        (c) =>
          c.method === "Runtime.evaluate" &&
          typeof c.params?.expression === "string" &&
          (c.params.expression as string).includes("tool-call"),
      );
      expect(callEval).toBeDefined();
      const expr = callEval!.params!.expression as string;
      // Extract callId from the expression
      const match = /\\"callId\\":\\"([^"\\]+)\\"/.exec(expr);
      expect(match).toBeTruthy();
      const callId = match![1];

      session.emitEvent(
        makeRozeniteEvent("tool-result", { callId, success: true, result: { echo: "hi" } }),
      );

      const result = await callPromise;
      expect(result).toEqual({ ok: true, data: { echo: "hi" } });
    });

    it("call rejects when tool-result reports failure", async () => {
      const callPromise = runCommand(plugin, "call", session, { name: "app.echo" });
      await Promise.resolve();

      const callEval = session.sendHistory.find(
        (c) =>
          c.method === "Runtime.evaluate" &&
          typeof c.params?.expression === "string" &&
          (c.params.expression as string).includes("tool-call"),
      );
      const match = /\\"callId\\":\\"([^"\\]+)\\"/.exec(callEval!.params!.expression as string);
      const callId = match![1];

      session.emitEvent(
        makeRozeniteEvent("tool-result", { callId, success: false, error: "Tool threw an error" }),
      );

      const result = await callPromise;
      expect(result).toEqual({ ok: false, error: expect.stringContaining("Tool threw an error") });
    });

    it("call returns error when no active session", async () => {
      const freshPlugin = new RozenitePlugin();
      const result = await runCommand(freshPlugin, "call", null, { name: "app.echo" });
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining("No active Rozenite session"),
      });
    });
  });
});
