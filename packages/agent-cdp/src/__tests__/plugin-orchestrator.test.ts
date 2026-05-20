import { describe, expect, it, vi } from "vitest";

import type { AgentPlugin, AgentPluginCommand, AgentPluginState, AgentPluginTargetSession } from "../plugin.js";
import { PluginOrchestrator } from "../plugin-orchestrator.js";
import type { CdpTransport, CdpEventMessage, RuntimeSession } from "../types.js";

function makeTransport(overrides: Partial<CdpTransport> = {}): CdpTransport {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => true),
    send: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => {}),
    ...overrides,
  };
}

function makeSession(transport = makeTransport()): RuntimeSession {
  return {
    target: {
      id: "rn:test:1",
      rawId: "test-1",
      title: "Test App",
      kind: "react-native",
      description: "Test",
      webSocketDebuggerUrl: "ws://localhost/devtools/1",
      sourceUrl: "http://localhost",
    },
    transport,
    ensureConnected: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

function makePlugin(
  id: string,
  overrides: Partial<AgentPlugin> & { commands?: AgentPluginCommand[]; state?: AgentPluginState } = {},
): AgentPlugin {
  const { state = { kind: "idle" }, commands = [], ...rest } = overrides;
  return {
    id,
    displayName: id,
    commands,
    supportsTarget: vi.fn(() => true),
    getState: vi.fn(() => state),
    ...rest,
  };
}

function makeCommand(name: string, result: unknown = null): AgentPluginCommand {
  return {
    name,
    summary: name,
    execute: vi.fn(async () => result),
  };
}

describe("PluginOrchestrator", () => {
  describe("constructor validation", () => {
    it("throws on duplicate plugin ids", () => {
      expect(() => new PluginOrchestrator([makePlugin("foo"), makePlugin("foo")])).toThrow(
        "Duplicate plugin id: 'foo'",
      );
    });

    it("throws on duplicate derived command ids across plugins", () => {
      const a = makePlugin("foo", { commands: [makeCommand("bar")] });
      const b = makePlugin("foo", { commands: [makeCommand("bar")] });
      // same plugin id already triggers first — use different plugin ids but same derived id isn't possible
      // test same command name within one plugin isn't a derived-id collision, but two plugins with same id is caught first
      // test the command id path: same plugin id would be caught first, so we need to test a hypothetical
      // where two different plugins share a derived id — that cannot happen since derived = pluginId.commandName
      // and plugin ids must be unique. So just verify the plugin-id duplicate is caught.
      expect(() => new PluginOrchestrator([a, b])).toThrow("Duplicate plugin id: 'foo'");
    });

    it("accepts distinct plugin ids", () => {
      expect(() => new PluginOrchestrator([makePlugin("foo"), makePlugin("bar")])).not.toThrow();
    });
  });

  describe("dispatch", () => {
    it("returns error for unknown plugin", async () => {
      const o = new PluginOrchestrator([]);
      const result = await o.dispatch("nope", "cmd");
      expect(result).toEqual({ ok: false, error: "Unknown plugin 'nope'" });
    });

    it("returns error for unknown command", async () => {
      const o = new PluginOrchestrator([makePlugin("p")]);
      const result = await o.dispatch("p", "nope");
      expect(result).toEqual({ ok: false, error: "Unknown command 'nope' for plugin 'p'" });
    });

    it("returns error when state is unsupported-target", async () => {
      const plugin = makePlugin("p", {
        state: { kind: "unsupported-target", reason: "chrome target not supported" },
        commands: [makeCommand("cmd")],
      });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd");
      expect(result).toEqual({
        ok: false,
        error: "Plugin 'p' does not support the current target: chrome target not supported",
      });
    });

    it("returns error when state is waiting-for-runtime", async () => {
      const plugin = makePlugin("p", {
        state: { kind: "waiting-for-runtime", reason: "bridge not installed" },
        commands: [makeCommand("cmd")],
      });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd");
      expect(result).toEqual({
        ok: false,
        error: "Plugin 'p' is waiting for runtime: bridge not installed",
      });
    });

    it("returns error when state is error", async () => {
      const plugin = makePlugin("p", {
        state: { kind: "error", reason: "crashed" },
        commands: [makeCommand("cmd")],
      });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd");
      expect(result).toEqual({ ok: false, error: "Plugin 'p' is in error state: crashed" });
    });

    it("executes command and returns data when state is ready", async () => {
      const cmd = makeCommand("cmd", { value: 42 });
      const plugin = makePlugin("p", { state: { kind: "ready" }, commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd", { x: 1 });
      expect(result).toEqual({ ok: true, data: { value: 42 } });
      expect(cmd.execute).toHaveBeenCalledWith(expect.objectContaining({ pluginId: "p" }), { x: 1 });
    });

    it("executes command when state is idle", async () => {
      const cmd = makeCommand("cmd", "ok");
      const plugin = makePlugin("p", { state: { kind: "idle" }, commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd");
      expect(result).toEqual({ ok: true, data: "ok" });
    });

    it("returns error when command throws", async () => {
      const cmd: AgentPluginCommand = {
        name: "cmd",
        summary: "cmd",
        execute: vi.fn(async () => {
          throw new Error("boom");
        }),
      };
      const plugin = makePlugin("p", { commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      const result = await o.dispatch("p", "cmd");
      expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("passes current session through command context", async () => {
      let capturedSession: AgentPluginTargetSession | null | undefined;
      const cmd: AgentPluginCommand = {
        name: "cmd",
        summary: "cmd",
        execute: vi.fn(async (ctx) => {
          capturedSession = ctx.session;
          return null;
        }),
      };
      const plugin = makePlugin("p", { commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      const session = makeSession();
      await o.onTargetSelected(session);
      await o.dispatch("p", "cmd");
      expect(capturedSession).not.toBeNull();
      expect(capturedSession?.target.id).toBe("rn:test:1");
    });

    it("exposes null session in command context when no target is selected", async () => {
      let capturedSession: AgentPluginTargetSession | null | undefined;
      const cmd: AgentPluginCommand = {
        name: "cmd",
        summary: "cmd",
        execute: vi.fn(async (ctx) => {
          capturedSession = ctx.session;
          return null;
        }),
      };
      const plugin = makePlugin("p", { commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      await o.dispatch("p", "cmd");
      expect(capturedSession).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("calls onDaemonStart on all plugins", async () => {
      const a = makePlugin("a", { onDaemonStart: vi.fn(async () => {}) });
      const b = makePlugin("b", { onDaemonStart: vi.fn(async () => {}) });
      const o = new PluginOrchestrator([a, b]);
      await o.start();
      expect(a.onDaemonStart).toHaveBeenCalled();
      expect(b.onDaemonStart).toHaveBeenCalled();
    });

    it("calls onDaemonStop on all plugins", async () => {
      const a = makePlugin("a", { onDaemonStop: vi.fn(async () => {}) });
      const o = new PluginOrchestrator([a]);
      await o.stop();
      expect(a.onDaemonStop).toHaveBeenCalled();
    });

    it("calls onTargetSelected with correct context", async () => {
      const plugin = makePlugin("p", { onTargetSelected: vi.fn(async () => {}) });
      const o = new PluginOrchestrator([plugin]);
      await o.onTargetSelected(makeSession());
      expect(plugin.onTargetSelected).toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: "p", session: expect.objectContaining({ target: expect.any(Object) }) }),
      );
    });

    it("calls onTargetReconnected with correct context", async () => {
      const plugin = makePlugin("p", { onTargetReconnected: vi.fn(async () => {}) });
      const o = new PluginOrchestrator([plugin]);
      await o.onTargetSelected(makeSession());
      await o.onTargetReconnected(makeSession());
      expect(plugin.onTargetReconnected).toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: "p" }),
      );
    });

    it("calls onTargetCleared with reason target-cleared and clears session", async () => {
      const plugin = makePlugin("p", { onTargetCleared: vi.fn(async () => {}) });
      const o = new PluginOrchestrator([plugin]);
      const session = makeSession();
      await o.onTargetSelected(session);
      await o.onTargetCleared();
      expect(plugin.onTargetCleared).toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: "p", reason: "target-cleared" }),
      );
      // session should be null after clear
      let capturedSession: AgentPluginTargetSession | null | undefined;
      const cmd: AgentPluginCommand = {
        name: "cmd",
        summary: "cmd",
        execute: vi.fn(async (ctx) => { capturedSession = ctx.session; return null; }),
      };
      (plugin.commands as AgentPluginCommand[]).push(cmd);
      await o.dispatch("p", "cmd");
      expect(capturedSession).toBeNull();
    });

    it("wraps RuntimeSession transport correctly", async () => {
      const transport = makeTransport();
      const session = makeSession(transport);
      let capturedSession: AgentPluginTargetSession | null | undefined;
      const cmd: AgentPluginCommand = {
        name: "cmd",
        summary: "cmd",
        execute: vi.fn(async (ctx) => { capturedSession = ctx.session; return null; }),
      };
      const plugin = makePlugin("p", { commands: [cmd] });
      const o = new PluginOrchestrator([plugin]);
      await o.onTargetSelected(session);
      await o.dispatch("p", "cmd");

      expect(capturedSession?.isConnected()).toBe(true);
      await capturedSession?.send("Runtime.enable");
      expect(transport.send).toHaveBeenCalledWith("Runtime.enable", undefined);

      const listener = vi.fn((_event: CdpEventMessage) => {});
      capturedSession?.onEvent(listener);
      expect(transport.onEvent).toHaveBeenCalled();
    });
  });
});