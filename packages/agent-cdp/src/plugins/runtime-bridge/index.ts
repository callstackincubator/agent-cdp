import {
  AGENT_CDP_BINDING_NAME,
  AGENT_CDP_RECEIVE_NAME,
  type AgentRuntimeBridgeRequest,
  type AgentRuntimeBridgeResponse,
  type AgentRuntimeMeasurementCommand,
  type IpcResponse,
  type TargetDescriptor,
} from "@agent-cdp/protocol";

import type {
  AgentPlugin,
  AgentPluginCommand,
  AgentPluginDetachContext,
  AgentPluginState,
  AgentPluginTargetContext,
  AgentPluginTargetSession,
} from "../../plugin.js";

type CoreCommandRelay = (cmd: AgentRuntimeMeasurementCommand) => Promise<IpcResponse>;

interface RuntimeBindingCalledParams {
  name?: string;
  payload?: string;
}

const SUPPORTED_RUNTIME_COMMANDS = new Set<AgentRuntimeMeasurementCommand["type"]>([
  "js-allocation-start",
  "js-allocation-status",
  "js-allocation-stop",
  "js-allocation-timeline-start",
  "js-allocation-timeline-status",
  "js-allocation-timeline-stop",
  "js-memory-sample",
  "js-profile-start",
  "js-profile-status",
  "js-profile-stop",
  "mem-snapshot-capture",
  "network-start",
  "network-status",
  "network-stop",
  "start-trace",
  "trace-status",
  "stop-trace",
]);

export class AgentRuntimeBridgePlugin implements AgentPlugin {
  readonly id = "runtime-bridge";
  readonly displayName = "Runtime Bridge";
  readonly description = "In-app SDK measurement bridge for React Native targets";
  readonly commands: readonly AgentPluginCommand[] = [];

  private state: AgentPluginState = { kind: "idle" };
  private session: AgentPluginTargetSession | null = null;
  private removeEventListener: (() => void) | null = null;

  constructor(private readonly dispatchCoreCommand: CoreCommandRelay) {}

  getState(): AgentPluginState {
    return this.state;
  }

  supportsTarget(target: TargetDescriptor): boolean {
    return target.kind === "react-native";
  }

  async onTargetSelected(ctx: AgentPluginTargetContext): Promise<void> {
    if (!this.supportsTarget(ctx.session.target)) {
      this.state = { kind: "unsupported-target", reason: "only React Native targets are supported" };
      return;
    }
    await this.attach(ctx.session);
  }

  async onTargetReconnected(ctx: AgentPluginTargetContext): Promise<void> {
    if (!this.supportsTarget(ctx.session.target)) {
      this.state = { kind: "unsupported-target", reason: "only React Native targets are supported" };
      return;
    }
    await this.attach(ctx.session);
  }

  async onTargetCleared(_ctx: AgentPluginDetachContext): Promise<void> {
    this.detach();
  }

  private async attach(session: AgentPluginTargetSession): Promise<void> {
    if (this.session === session && this.removeEventListener) {
      return;
    }

    this.detach();
    this.session = session;
    await session.send("Runtime.enable");
    await this.installBinding(session);
    this.removeEventListener = session.onEvent((message) => {
      if (
        message.method === "Runtime.executionContextsCleared" ||
        message.method === "Runtime.executionContextCreated"
      ) {
        void this.reinstallBinding(session);
        return;
      }
      if (message.method !== "Runtime.bindingCalled") {
        return;
      }
      void this.handleBindingCalled(session, message.params as RuntimeBindingCalledParams | undefined);
    });
    this.state = { kind: "ready" };
  }

  private detach(): void {
    this.removeEventListener?.();
    this.removeEventListener = null;
    this.session = null;
    this.state = { kind: "idle" };
  }

  private async handleBindingCalled(
    session: AgentPluginTargetSession,
    params: RuntimeBindingCalledParams | undefined,
  ): Promise<void> {
    if (params?.name !== AGENT_CDP_BINDING_NAME) {
      return;
    }

    let request: AgentRuntimeBridgeRequest | null = null;
    try {
      request = JSON.parse(params.payload || "") as AgentRuntimeBridgeRequest;
      if (!request.id || !this.isSupportedCommand(request.command)) {
        throw new Error("Unsupported agent-cdp bridge request");
      }
    } catch (error) {
      const response: AgentRuntimeBridgeResponse = {
        id: request?.id || "unknown",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      await this.sendResponse(session, response);
      return;
    }

    const ipcResponse = await this.dispatchCoreCommand(request.command);
    const response: AgentRuntimeBridgeResponse = ipcResponse.ok
      ? { id: request.id, ok: true, data: ipcResponse.data }
      : { id: request.id, ok: false, error: ipcResponse.error };
    await this.sendResponse(session, response);
  }

  private isSupportedCommand(command: unknown): command is AgentRuntimeBridgeRequest["command"] {
    if (!command || typeof command !== "object" || !("type" in command)) {
      return false;
    }
    return SUPPORTED_RUNTIME_COMMANDS.has(String(command.type) as AgentRuntimeMeasurementCommand["type"]);
  }

  private async installBinding(session: AgentPluginTargetSession): Promise<void> {
    await session.send("Runtime.addBinding", { name: AGENT_CDP_BINDING_NAME });
  }

  private async reinstallBinding(session: AgentPluginTargetSession): Promise<void> {
    if (this.session !== session || !session.isConnected()) {
      return;
    }
    try {
      await this.installBinding(session);
    } catch {
      // Runtime replacement can race with transport reconnect; a later reconnect attach will retry.
    }
  }

  private async sendResponse(session: AgentPluginTargetSession, response: AgentRuntimeBridgeResponse): Promise<void> {
    const payload = JSON.stringify(response);
    const expression = `globalThis[${JSON.stringify(AGENT_CDP_RECEIVE_NAME)}]?.(${JSON.stringify(payload)})`;
    await session.send("Runtime.evaluate", { expression, awaitPromise: false });
  }
}