import type { TargetDescriptor } from "@agent-cdp/protocol";

import type {
  AgentPlugin,
  AgentPluginCommand,
  AgentPluginDetachContext,
  AgentPluginState,
  AgentPluginTargetContext,
  AgentPluginTargetSession,
} from "../../plugin.js";
import { runBootstrap } from "./bootstrap.js";
import {
  AGENT_PLUGIN_ID,
  ROZENITE_DOMAIN,
  RUNTIME_GLOBAL,
  type RozeniteDevToolsMessage,
  type RozeniteRegisterToolPayload,
  type RozeniteToolCallPayload,
  type RozeniteToolResultPayload,
  type RozeniteUnregisterToolPayload,
} from "./protocol.js";
import { ToolRegistry } from "./tool-registry.js";

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class RozenitePlugin implements AgentPlugin {
  readonly id = "rozenite";
  readonly displayName = "Rozenite";
  readonly description = "Rozenite React Native agent bridge";
  readonly commands: readonly AgentPluginCommand[];

  private state: AgentPluginState = { kind: "idle" };
  private session: AgentPluginTargetSession | null = null;
  private removeEventListener: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private readonly toolRegistry = new ToolRegistry();
  private readonly pendingCalls = new Map<string, PendingCall>();

  constructor() {
    this.commands = this.buildCommands();
  }

  getState(): AgentPluginState {
    return this.state;
  }

  supportsTarget(target: TargetDescriptor): boolean {
    return target.kind === "react-native";
  }

  async onTargetSelected(ctx: AgentPluginTargetContext): Promise<void> {
    this.detach();
    this.state = { kind: "waiting-for-runtime", reason: "Bootstrapping Rozenite CDP bridge..." };
    this.abortController = new AbortController();

    const session = ctx.session;

    // Register event listener BEFORE calling initializeDomain to avoid missing early events.
    this.removeEventListener = session.onEvent((message) => {
      if (
        message.method === "Runtime.executionContextsCleared" ||
        message.method === "Runtime.executionContextCreated"
      ) {
        void this.reattach(session);
        return;
      }
      if (message.method !== "Runtime.bindingCalled") return;
      void this.handleBindingCalled(message.params);
    });

    void this.attach(session);
  }

  async onTargetReconnected(ctx: AgentPluginTargetContext): Promise<void> {
    return this.onTargetSelected(ctx);
  }

  async onTargetCleared(_ctx: AgentPluginDetachContext): Promise<void> {
    this.detach();
  }

  private detach(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.removeEventListener?.();
    this.removeEventListener = null;
    this.session = null;
    this.toolRegistry.clear();
    for (const [, pending] of this.pendingCalls) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Session detached"));
    }
    this.pendingCalls.clear();
    this.state = { kind: "idle" };
  }

  private async attach(session: AgentPluginTargetSession): Promise<void> {
    const signal = this.abortController?.signal;

    try {
      await runBootstrap(session, signal);
      if (signal?.aborted) return;

      this.session = session;

      await session.send("Runtime.evaluate", {
        expression: `void globalThis.${RUNTIME_GLOBAL}.initializeDomain(${JSON.stringify(ROZENITE_DOMAIN)})`,
      });

      await this.sendDomainMessage(session, {
        pluginId: AGENT_PLUGIN_ID,
        type: "agent-session-ready",
        payload: { sessionId: session.target.id },
      });

      this.state = { kind: "ready" };
    } catch (err) {
      const error = err as Error;
      if (error.name !== "AbortError" && !signal?.aborted) {
        this.state = { kind: "error", reason: error.message };
      }
    }
  }

  private async reattach(session: AgentPluginTargetSession): Promise<void> {
    if (this.session !== session || !session.isConnected()) return;
    this.toolRegistry.clear();
    this.state = { kind: "waiting-for-runtime", reason: "Reconnecting after context reload..." };
    try {
      await runBootstrap(session, this.abortController?.signal);
      await session.send("Runtime.evaluate", {
        expression: `void globalThis.${RUNTIME_GLOBAL}.initializeDomain(${JSON.stringify(ROZENITE_DOMAIN)})`,
      });
      await this.sendDomainMessage(session, {
        pluginId: AGENT_PLUGIN_ID,
        type: "agent-session-ready",
        payload: { sessionId: session.target.id },
      });
      this.state = { kind: "ready" };
    } catch {
      // A later reconnect will retry; ignore errors here.
    }
  }

  private async sendDomainMessage(
    session: AgentPluginTargetSession,
    message: RozeniteDevToolsMessage,
  ): Promise<void> {
    const serialized = JSON.stringify(message);
    const escaped = JSON.stringify(serialized);
    await session.send("Runtime.evaluate", {
      expression: `globalThis.${RUNTIME_GLOBAL}.sendMessage(${JSON.stringify(ROZENITE_DOMAIN)}, ${escaped})`,
    });
  }

  private handleBindingCalled(params: Record<string, unknown> | undefined): void {
    const rawPayload = params?.payload;
    if (typeof rawPayload !== "string") return;

    let envelope: { domain?: unknown; message?: unknown };
    try {
      envelope = JSON.parse(rawPayload) as typeof envelope;
    } catch {
      return;
    }

    if (envelope.domain !== ROZENITE_DOMAIN) return;

    const msg = envelope.message as RozeniteDevToolsMessage | undefined;
    if (!msg || msg.pluginId !== AGENT_PLUGIN_ID) return;

    switch (msg.type) {
      case "register-tool": {
        const { tools } = msg.payload as RozeniteRegisterToolPayload;
        this.toolRegistry.register(tools);
        break;
      }
      case "unregister-tool": {
        const { toolNames } = msg.payload as RozeniteUnregisterToolPayload;
        this.toolRegistry.unregister(toolNames);
        break;
      }
      case "tool-result": {
        const { callId, success, result, error } = msg.payload as RozeniteToolResultPayload;
        const pending = this.pendingCalls.get(callId);
        if (!pending) return;
        this.pendingCalls.delete(callId);
        clearTimeout(pending.timeoutId);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error ?? "Tool call failed"));
        }
        break;
      }
    }
  }

  private buildCommands(): AgentPluginCommand[] {
    return [
      {
        name: "status",
        summary: "Show Rozenite plugin state and registered tool count",
        alwaysExecutable: true,
        execute: async (ctx) => {
          const state = ctx.getState();
          return {
            state: state.kind,
            ...(state.kind === "error" ? { error: state.reason } : {}),
            toolCount: this.toolRegistry.size(),
            target: ctx.session?.target ?? null,
          };
        },
      },
      {
        name: "tools",
        summary: "List registered Rozenite tools",
        execute: async () => {
          return this.toolRegistry
            .getAll()
            .map((t) => ({ name: t.name, description: t.description }));
        },
      },
      {
        name: "tool-schema",
        summary: "Show input schema for a Rozenite tool",
        execute: async (_ctx, input) => {
          const { name } = input as { name: string };
          const tool = this.toolRegistry.get(name);
          if (!tool) throw new Error(`Tool '${name}' not found`);
          return tool.inputSchema;
        },
      },
      {
        name: "call",
        summary: "Call a Rozenite tool",
        execute: async (_ctx, input) => {
          const { name, arguments: args } = input as { name: string; arguments?: unknown };
          const session = this.session;
          if (!session) throw new Error("No active Rozenite session");

          const callId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          const resultPromise = new Promise<unknown>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              this.pendingCalls.delete(callId);
              reject(new Error("Tool call timeout"));
            }, 30_000);
            this.pendingCalls.set(callId, { resolve, reject, timeoutId });
          });

          const payload: RozeniteToolCallPayload = {
            callId,
            toolName: name,
            arguments: args ?? null,
          };

          await this.sendDomainMessage(session, {
            pluginId: AGENT_PLUGIN_ID,
            type: "tool-call",
            payload,
          });

          return resultPromise;
        },
      },
    ];
  }
}
