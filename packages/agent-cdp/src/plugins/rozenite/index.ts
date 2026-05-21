import type { TargetDescriptor } from "@agent-cdp/protocol";

import type {
  AgentPlugin,
  AgentPluginCommand,
  AgentPluginDetachContext,
  AgentPluginState,
  AgentPluginTargetContext,
} from "../../plugin.js";
import {
  ROZENITE_AGENT_BASE,
  type RozeniteApiResponse,
  type RozeniteApiTool,
  type RozeniteSessionInfo,
} from "./protocol.js";

export class RozenitePlugin implements AgentPlugin {
  readonly id = "rozenite";
  readonly displayName = "Rozenite";
  readonly description = "Rozenite React Native agent bridge";
  readonly commands: readonly AgentPluginCommand[];

  private state: AgentPluginState = { kind: "idle" };
  private sessionId: string | null = null;
  private metroBaseUrl: string | null = null;
  private abortController: AbortController | null = null;

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
    this.state = { kind: "waiting-for-runtime", reason: "Connecting to Rozenite HTTP agent..." };
    this.sessionId = null;
    this.metroBaseUrl = null;
    this.abortController = new AbortController();
    void this.connect(ctx.session.target);
  }

  async onTargetReconnected(ctx: AgentPluginTargetContext): Promise<void> {
    return this.onTargetSelected(ctx);
  }

  async onTargetCleared(_ctx: AgentPluginDetachContext): Promise<void> {
    await this.teardown();
    this.state = { kind: "idle" };
  }

  private async teardown(): Promise<void> {
    const ctrl = this.abortController;
    this.abortController = null;
    ctrl?.abort();

    const { sessionId, metroBaseUrl } = this;
    this.sessionId = null;
    this.metroBaseUrl = null;

    if (sessionId && metroBaseUrl) {
      void fetch(`${metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions/${sessionId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }

  private async connect(target: TargetDescriptor): Promise<void> {
    const metroBaseUrl = target.sourceUrl;
    const deviceId = target.reactNative?.logicalDeviceId;
    const signal = this.abortController?.signal;

    try {
      const body: Record<string, string> = {};
      if (deviceId) body.deviceId = deviceId;

      const response = await fetch(`${metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      const json = (await response.json()) as RozeniteApiResponse<{ session: RozeniteSessionInfo }>;

      if (signal?.aborted) return;

      if (!json.ok) {
        throw new Error(json.error?.message ?? "Failed to create Rozenite session");
      }

      this.metroBaseUrl = metroBaseUrl;
      this.sessionId = json.result!.session.id;
      this.state = { kind: "ready" };
    } catch (err) {
      const error = err as Error;
      if (error.name !== "AbortError" && !signal?.aborted) {
        this.state = { kind: "error", reason: error.message };
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
          let toolCount = 0;
          if (state.kind === "ready" && this.sessionId && this.metroBaseUrl) {
            try {
              const resp = await fetch(
                `${this.metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions/${this.sessionId}`
              );
              const json = (await resp.json()) as RozeniteApiResponse<{ session: RozeniteSessionInfo }>;
              if (json.ok && json.result) toolCount = json.result.session.toolCount;
            } catch {}
          }
          return {
            state: state.kind,
            ...(state.kind === "error" ? { error: state.reason } : {}),
            toolCount,
            target: ctx.session?.target ?? null,
          };
        },
      },
      {
        name: "tools",
        summary: "List registered Rozenite tools",
        execute: async () => {
          const { sessionId, metroBaseUrl } = this;
          if (!sessionId || !metroBaseUrl) throw new Error("No active Rozenite session");
          const resp = await fetch(`${metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions/${sessionId}/tools`);
          const json = (await resp.json()) as RozeniteApiResponse<{ tools: RozeniteApiTool[] }>;
          if (!json.ok) throw new Error(json.error?.message ?? "Failed to list tools");
          return (json.result?.tools ?? []).map((t) => ({ name: t.name, description: t.description }));
        },
      },
      {
        name: "tool-schema",
        summary: "Show input schema for a Rozenite tool",
        execute: async (_ctx, input) => {
          const { name } = input as { name: string };
          const { sessionId, metroBaseUrl } = this;
          if (!sessionId || !metroBaseUrl) throw new Error("No active Rozenite session");
          const resp = await fetch(`${metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions/${sessionId}/tools`);
          const json = (await resp.json()) as RozeniteApiResponse<{ tools: RozeniteApiTool[] }>;
          if (!json.ok) throw new Error(json.error?.message ?? "Failed to fetch tools");
          const tool = (json.result?.tools ?? []).find((t) => t.name === name);
          if (!tool) throw new Error(`Tool '${name}' not found`);
          return tool.inputSchema;
        },
      },
      {
        name: "call",
        summary: "Call a Rozenite tool",
        execute: async (_ctx, input) => {
          const { name, arguments: args } = input as { name: string; arguments?: unknown };
          const { sessionId, metroBaseUrl } = this;
          if (!sessionId || !metroBaseUrl) throw new Error("No active Rozenite session");
          const resp = await fetch(
            `${metroBaseUrl}${ROZENITE_AGENT_BASE}/sessions/${sessionId}/call-tool`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toolName: name, args: args ?? null }),
            }
          );
          const json = (await resp.json()) as RozeniteApiResponse<{ result: unknown }>;
          if (!json.ok) throw new Error(json.error?.message ?? "Tool call failed");
          return json.result?.result;
        },
      },
    ];
  }
}