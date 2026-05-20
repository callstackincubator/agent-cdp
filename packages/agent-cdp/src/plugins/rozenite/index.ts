import crypto from "node:crypto";

import type { TargetDescriptor } from "@agent-cdp/protocol";

import type {
  AgentPlugin,
  AgentPluginCommand,
  AgentPluginDetachContext,
  AgentPluginState,
  AgentPluginTargetContext,
  AgentPluginTargetSession,
} from "../../plugin.js";
import { bootstrapRozenite } from "./bootstrap.js";
import {
  DOMAIN_NAME,
  RUNTIME_GLOBAL,
  type AgentToAppMessage,
  type AppToAgentMessage,
  type BindingPayload,
} from "./protocol.js";
import { RozeniteToolRegistry } from "./tool-registry.js";

export class RozenitePlugin implements AgentPlugin {
  readonly id = "rozenite";
  readonly displayName = "Rozenite";
  readonly description = "Rozenite React Native devtools bridge";
  readonly commands: readonly AgentPluginCommand[];

  private state: AgentPluginState = { kind: "idle" };
  private readonly registry = new RozeniteToolRegistry();
  private abortController: AbortController | null = null;
  private readonly pendingCalls = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();

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
    this.state = { kind: "waiting-for-runtime", reason: `Waiting for ${RUNTIME_GLOBAL}` };
    this.registry.clear();
    this.abortController = new AbortController();
    ctx.session.onDisconnected(() => this.handleDisconnect());
    void this.runBootstrap(ctx.session);
  }

  async onTargetReconnected(ctx: AgentPluginTargetContext): Promise<void> {
    return this.onTargetSelected(ctx);
  }

  async onTargetCleared(_ctx: AgentPluginDetachContext): Promise<void> {
    this.teardown(new Error("Target cleared"));
    this.state = { kind: "idle" };
  }

  private handleDisconnect(): void {
    this.teardown(new Error("Target disconnected"));
    this.state = { kind: "idle" };
  }

  private teardown(error: Error): void {
    this.abortController?.abort();
    this.abortController = null;
    this.registry.clear();
    for (const pending of this.pendingCalls.values()) {
      pending.reject(error);
    }
    this.pendingCalls.clear();
  }

  private async runBootstrap(session: AgentPluginTargetSession): Promise<void> {
    try {
      const { bindingName } = await bootstrapRozenite(session, this.abortController!.signal);

      session.onEvent((event) => {
        if (event.method !== "Runtime.bindingCalled") return;
        const params = event.params as { name?: string; payload?: string };
        if (params.name !== bindingName) return;
        try {
          const envelope = JSON.parse(params.payload ?? "") as BindingPayload;
          if (envelope.domain !== DOMAIN_NAME) return;
          this.handleMessage(envelope.message as AppToAgentMessage);
        } catch {}
      });

      await this.sendToApp(session, { type: "agent-session-ready" });
      this.state = { kind: "ready" };
    } catch (err) {
      if ((err as Error).message !== "aborted") {
        this.state = { kind: "error", reason: (err as Error).message };
      }
    }
  }

  private handleMessage(msg: AppToAgentMessage): void {
    switch (msg.type) {
      case "register-tool":
        this.registry.register("app", msg.tools);
        break;
      case "unregister-tool":
        this.registry.unregister(msg.toolNames);
        break;
      case "tool-result": {
        const pending = this.pendingCalls.get(msg.callId);
        if (!pending) return;
        this.pendingCalls.delete(msg.callId);
        if (msg.success) {
          pending.resolve({ success: true, result: msg.result });
        } else {
          pending.resolve({ success: false, error: msg.error });
        }
        break;
      }
    }
  }

  private async sendToApp(session: AgentPluginTargetSession, message: AgentToAppMessage): Promise<void> {
    const payload = JSON.stringify(JSON.stringify(message));
    await session.send("Runtime.evaluate", {
      expression: `${RUNTIME_GLOBAL}.sendMessage('${DOMAIN_NAME}', ${payload})`,
    });
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
            toolCount: this.registry.size,
            target: ctx.session?.target ?? null,
          };
        },
      },
      {
        name: "tools",
        summary: "List registered Rozenite tools",
        execute: async () => {
          return this.registry.list().map((t) => ({
            name: t.qualifiedName,
            description: t.description,
          }));
        },
      },
      {
        name: "tool-schema",
        summary: "Show input schema for a Rozenite tool",
        execute: async (_ctx, input) => {
          const { name } = input as { name: string };
          const tool = this.registry.get(name);
          if (!tool) throw new Error(`Tool '${name}' not found`);
          return tool.inputSchema;
        },
      },
      {
        name: "call",
        summary: "Call a Rozenite tool",
        execute: async (ctx, input) => {
          const { name, arguments: args } = input as { name: string; arguments?: unknown };
          const tool = this.registry.get(name);
          if (!tool) throw new Error(`Tool '${name}' not found`);

          const callId = crypto.randomUUID();
          return new Promise<unknown>((resolve, reject) => {
            this.pendingCalls.set(callId, { resolve, reject });

            void this.sendToApp(ctx.session!, {
              type: "tool-call",
              callId,
              toolName: name,
              arguments: args ?? null,
            }).catch((err: unknown) => {
              this.pendingCalls.delete(callId);
              reject(err instanceof Error ? err : new Error(String(err)));
            });

            setTimeout(() => {
              if (this.pendingCalls.has(callId)) {
                this.pendingCalls.delete(callId);
                reject(new Error(`Tool call '${name}' timed out after 60s`));
              }
            }, 60_000);
          });
        },
      },
    ];
  }
}