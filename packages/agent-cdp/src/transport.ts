import WebSocket from "ws";

import type { CdpEventMessage, CdpTransport, TargetDescriptor } from "./types.js";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WebSocketCdpTransport implements CdpTransport {
  private readonly listeners = new Set<(message: CdpEventMessage) => void>();
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private nextId = 1;
  private socket: WebSocket | null = null;

  constructor(private readonly target: TargetDescriptor) {}

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.target.webSocketDebuggerUrl);

      socket.once("open", () => {
        this.socket = socket;
        resolve();
      });

      socket.once("error", (error) => {
        reject(new Error(`Failed to connect to ${this.target.id}: ${toErrorMessage(error)}`));
      });

      socket.on("message", (data) => {
        this.handleRawMessage(data.toString());
      });

      socket.on("close", () => {
        this.socket = null;
        this.rejectPending(new Error(`Transport closed for ${this.target.id}`));
      });
    });
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    if (!socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Transport is not connected for ${this.target.id}`));
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket?.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(listener: (message: CdpEventMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleRawMessage(rawMessage: string): void {
    const message = JSON.parse(rawMessage) as {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: unknown;
      error?: { message?: string };
    };

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || `CDP request failed for ${this.target.id}`));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (!message.method) {
      return;
    }

    for (const listener of this.listeners) {
      listener({ method: message.method, params: message.params });
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
