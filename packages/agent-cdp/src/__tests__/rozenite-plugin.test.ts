import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentPluginCommandContext, AgentPluginTargetContext, AgentPluginTargetSession } from "../plugin.js";
import { PluginOrchestrator } from "../plugin-orchestrator.js";
import { RozenitePlugin } from "../plugins/rozenite/index.js";
import { ROZENITE_AGENT_BASE } from "../plugins/rozenite/protocol.js";
import type { IpcResponse, TargetDescriptor } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRO_BASE = "http://localhost:8081";
const DEVICE_ID = "test-device-id";
const SESSION_URL = `${METRO_BASE}${ROZENITE_AGENT_BASE}/sessions`;
const SESSION_ID_URL = `${SESSION_URL}/${DEVICE_ID}`;
const SESSION_TOOLS_URL = `${SESSION_ID_URL}/tools`;
const SESSION_CALL_URL = `${SESSION_ID_URL}/call-tool`;

const SESSION_INFO = {
  id: DEVICE_ID,
  deviceId: DEVICE_ID,
  deviceName: "Test Device",
  status: "connected",
  toolCount: 0,
  createdAt: 0,
  lastActivityAt: 0,
};

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
  sourceUrl: METRO_BASE,
  reactNative: { logicalDeviceId: DEVICE_ID, capabilities: {} },
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
  private readonly disconnectListeners: ((error?: Error) => void)[] = [];
  readonly target: TargetDescriptor;

  constructor(target: TargetDescriptor = RN_TARGET) {
    this.target = target;
  }

  isConnected(): boolean {
    return true;
  }

  send(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  onEvent(): () => void {
    return () => {};
  }

  onDisconnected(listener: (error?: Error) => void): () => void {
    this.disconnectListeners.push(listener);
    return () => {
      const i = this.disconnectListeners.indexOf(listener);
      if (i >= 0) this.disconnectListeners.splice(i, 1);
    };
  }

  emitDisconnect(error?: Error): void {
    for (const listener of this.disconnectListeners) {
      listener(error);
    }
  }
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

type FetchResponse = Record<string, unknown>;

function makeFetch(responses: Record<string, FetchResponse>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url}`;
    const body = responses[key] ?? responses[url] ?? { ok: false, error: { message: "Not mocked" } };
    return {
      ok: true,
      json: async () => body,
    };
  });
}

function makeConnectFetch(extra: Record<string, FetchResponse> = {}) {
  return makeFetch({
    [`POST ${SESSION_URL}`]: { ok: true, result: { session: SESSION_INFO } },
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTargetContext(session: FakeSession): AgentPluginTargetContext {
  return { pluginId: "rozenite", session };
}

function makeCommandContext(plugin: RozenitePlugin, session: FakeSession | null): AgentPluginCommandContext {
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

async function flushConnect(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RozenitePlugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  describe("connect", () => {
    it("transitions to ready after successful session creation", async () => {
      vi.stubGlobal("fetch", makeConnectFetch());
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      expect(plugin.getState()).toEqual({ kind: "idle" });
      await plugin.onTargetSelected(makeTargetContext(session));
      expect(plugin.getState()).toEqual({ kind: "waiting-for-runtime", reason: expect.any(String) });

      await flushConnect();

      expect(plugin.getState()).toEqual({ kind: "ready" });
    });

    it("sends deviceId in the POST body", async () => {
      const mockFetch = makeConnectFetch();
      vi.stubGlobal("fetch", mockFetch);
      const plugin = new RozenitePlugin();

      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();

      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === SESSION_URL && (init as RequestInit)?.method === "POST"
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ deviceId: DEVICE_ID });
    });

    it("transitions to error when session creation fails", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetch({ [`POST ${SESSION_URL}`]: { ok: false, error: { message: "Rozenite not enabled" } } })
      );
      const plugin = new RozenitePlugin();

      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();

      expect(plugin.getState()).toEqual({ kind: "error", reason: "Rozenite not enabled" });
    });

    it("transitions to error when fetch throws (Metro unreachable)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("fetch failed");
        })
      );
      const plugin = new RozenitePlugin();

      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();

      expect(plugin.getState()).toEqual({ kind: "error", reason: "fetch failed" });
    });

    it("does not transition to error when target is cleared during connect", async () => {
      vi.useFakeTimers();
      // Never resolves
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });

      expect(plugin.getState()).toEqual({ kind: "idle" });
      vi.useRealTimers();
    });

    it("transitions back to idle after onTargetCleared", async () => {
      vi.stubGlobal("fetch", makeConnectFetch({ [`DELETE ${SESSION_ID_URL}`]: { ok: true, result: { stopped: true } } }));
      const plugin = new RozenitePlugin();

      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();
      expect(plugin.getState()).toEqual({ kind: "ready" });

      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
      expect(plugin.getState()).toEqual({ kind: "idle" });
    });

    it("DELETEs the session on onTargetCleared", async () => {
      const mockFetch = makeConnectFetch({
        [`DELETE ${SESSION_ID_URL}`]: { ok: true, result: { stopped: true } },
      });
      vi.stubGlobal("fetch", mockFetch);
      const plugin = new RozenitePlugin();

      await plugin.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();
      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });

      const deleteCall = mockFetch.mock.calls.find(
        ([url, init]) => url === SESSION_ID_URL && (init as RequestInit)?.method === "DELETE"
      );
      expect(deleteCall).toBeDefined();
    });

    it("stays ready when CDP session disconnects (HTTP session is independent)", async () => {
      vi.stubGlobal("fetch", makeConnectFetch());
      const plugin = new RozenitePlugin();
      const session = new FakeSession();

      await plugin.onTargetSelected(makeTargetContext(session));
      await flushConnect();
      expect(plugin.getState()).toEqual({ kind: "ready" });

      session.emitDisconnect();
      expect(plugin.getState()).toEqual({ kind: "ready" });
    });
  });

  describe("commands", () => {
    let plugin: RozenitePlugin;
    let session: FakeSession;

    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        makeConnectFetch({
          [SESSION_ID_URL]: {
            ok: true,
            result: { session: { ...SESSION_INFO, toolCount: 3 } },
          },
          [SESSION_TOOLS_URL]: {
            ok: true,
            result: {
              tools: [
                { name: "echo", description: "Echoes text", inputSchema: { type: "object" } },
                { name: "getTimestamp", description: "Returns timestamp", inputSchema: { type: "object", properties: {} } },
              ],
            },
          },
          [`POST ${SESSION_CALL_URL}`]: {
            ok: true,
            result: { result: { value: 42 } },
          },
          [`DELETE ${SESSION_ID_URL}`]: { ok: true, result: { stopped: true } },
        })
      );
      plugin = new RozenitePlugin();
      session = new FakeSession();
      await plugin.onTargetSelected(makeTargetContext(session));
      await flushConnect();
    });

    afterEach(async () => {
      await plugin.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
      vi.unstubAllGlobals();
    });

    it("status returns state, toolCount, and target", async () => {
      const result = await runCommand(plugin, "status", session);
      expect(result).toEqual({
        ok: true,
        data: { state: "ready", toolCount: 3, target: RN_TARGET },
      });
    });

    it("status works in waiting-for-runtime state (alwaysExecutable)", async () => {
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      const plugin2 = new RozenitePlugin();
      const session2 = new FakeSession();
      const orchestrator = new PluginOrchestrator([plugin2]);

      void plugin2.onTargetSelected(makeTargetContext(session2));

      const result = await orchestrator.dispatch("rozenite", "status");
      expect(result.ok).toBe(true);
      expect((result.data as { state: string }).state).toBe("waiting-for-runtime");
      expect((result.data as { toolCount: number }).toolCount).toBe(0);

      await plugin2.onTargetCleared({ pluginId: "rozenite", target: RN_TARGET, reason: "target-cleared" });
    });

    it("tools returns list of tool names and descriptions", async () => {
      const result = await runCommand(plugin, "tools", session);
      expect(result).toEqual({
        ok: true,
        data: [
          { name: "echo", description: "Echoes text" },
          { name: "getTimestamp", description: "Returns timestamp" },
        ],
      });
    });

    it("tool-schema returns inputSchema for a registered tool", async () => {
      const result = await runCommand(plugin, "tool-schema", session, { name: "echo" });
      expect(result).toEqual({ ok: true, data: { type: "object" } });
    });

    it("tool-schema returns error for unknown tool", async () => {
      const result = await runCommand(plugin, "tool-schema", session, { name: "unknown" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("unknown") });
    });

    it("call returns tool result", async () => {
      const result = await runCommand(plugin, "call", session, { name: "echo", arguments: { text: "hi" } });
      expect(result).toEqual({ ok: true, data: { value: 42 } });
    });

    it("call returns error when Rozenite reports failure", async () => {
      vi.stubGlobal(
        "fetch",
        makeConnectFetch({
          [`POST ${SESSION_CALL_URL}`]: { ok: false, error: { message: "Tool threw: something went wrong" } },
        })
      );
      const plugin2 = new RozenitePlugin();
      await plugin2.onTargetSelected(makeTargetContext(new FakeSession()));
      await flushConnect();

      const result = await runCommand(plugin2, "call", new FakeSession(), { name: "echo" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("something went wrong") });
    });

    it("call returns error for no active session", async () => {
      const freshPlugin = new RozenitePlugin();
      const result = await runCommand(freshPlugin, "call", null, { name: "echo" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("No active Rozenite session") });
    });
  });
});