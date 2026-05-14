import {
  AGENT_CDP_BINDING_NAME,
  AGENT_CDP_RECEIVE_NAME,
  type AgentRuntimeBridgeRequest,
  type AgentRuntimeBridgeResponse,
} from "@agent-cdp/protocol";

import type { AgentCdpCommandDispatcher } from "../command-dispatcher.js";
import type { CdpEventMessage, RuntimeSession } from "../types.js";

interface RuntimeBindingCalledParams {
  name?: string;
  payload?: string;
}

export class AgentRuntimeBridge {
  private session: RuntimeSession | null = null;
  private removeEventListener: (() => void) | null = null;

  constructor(private readonly dispatcher: AgentCdpCommandDispatcher) {}

  async attach(session: RuntimeSession): Promise<void> {
    if (this.session === session && this.removeEventListener) {
      return;
    }

    this.detach();
    this.session = session;
    await session.transport.send("Runtime.enable");
    await session.transport.send("Runtime.addBinding", { name: AGENT_CDP_BINDING_NAME });
    this.removeEventListener = session.transport.onEvent((message) => {
      if (message.method !== "Runtime.bindingCalled") {
        return;
      }
      void this.handleBindingCalled(session, message);
    });
  }

  detach(): void {
    this.removeEventListener?.();
    this.removeEventListener = null;
    this.session = null;
  }

  private async handleBindingCalled(session: RuntimeSession, message: CdpEventMessage): Promise<void> {
    const params = message.params as RuntimeBindingCalledParams | undefined;
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

    const ipcResponse = await this.dispatcher.dispatch(request.command);
    const response: AgentRuntimeBridgeResponse = ipcResponse.ok
      ? { id: request.id, ok: true, data: ipcResponse.data }
      : { id: request.id, ok: false, error: ipcResponse.error };
    await this.sendResponse(session, response);
  }

  private isSupportedCommand(command: unknown): command is AgentRuntimeBridgeRequest["command"] {
    if (!command || typeof command !== "object" || !("type" in command)) {
      return false;
    }

    return ["js-profile-start", "js-profile-status", "js-profile-stop"].includes(String(command.type));
  }

  private async sendResponse(session: RuntimeSession, response: AgentRuntimeBridgeResponse): Promise<void> {
    const payload = JSON.stringify(response);
    const expression = `globalThis[${JSON.stringify(AGENT_CDP_RECEIVE_NAME)}]?.(${JSON.stringify(payload)})`;
    await session.transport.send("Runtime.evaluate", { expression, awaitPromise: false });
  }
}
