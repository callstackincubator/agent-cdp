import type { ConsoleMessage, CdpEventMessage, RuntimeSession } from "./types.js";

interface RuntimeConsoleMessage {
  type?: string;
  args?: Array<{ value?: unknown; description?: string; type?: string }>;
  stackTrace?: {
    callFrames?: Array<{ functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }>;
  };
  timestamp?: number;
}

interface AddedConsoleMessage {
  text?: string;
  level?: string;
  source?: string;
  url?: string;
  line?: number;
  column?: number;
}

export class ConsoleCollector {
  private messages: ConsoleMessage[] = [];
  private nextId = 1;
  private unsubscribe: (() => void) | null = null;

  async attach(session: RuntimeSession): Promise<void> {
    this.detach();
    this.messages = [];
    this.nextId = 1;

    this.unsubscribe = session.transport.onEvent((message) => {
      this.handleEvent(message);
    });

    await Promise.allSettled([
      session.transport.send("Runtime.enable"),
      session.transport.send("Console.enable"),
      session.transport.send("Log.enable"),
    ]);
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  list(limit?: number): ConsoleMessage[] {
    if (!limit || limit <= 0) {
      return [...this.messages];
    }

    return this.messages.slice(-limit);
  }

  get(id: number): ConsoleMessage | undefined {
    return this.messages.find((message) => message.id === id);
  }

  private handleEvent(message: CdpEventMessage): void {
    if (message.method === "Runtime.consoleAPICalled") {
      this.messages.push(this.createRuntimeMessage(message.params as RuntimeConsoleMessage));
      return;
    }

    if (message.method === "Console.messageAdded") {
      const payload = (message.params?.message || {}) as AddedConsoleMessage;
      this.messages.push(this.createAddedMessage("console", payload));
      return;
    }

    if (message.method === "Log.entryAdded") {
      const payload = (message.params?.entry || {}) as AddedConsoleMessage;
      this.messages.push(this.createAddedMessage("log", payload));
    }
  }

  private createRuntimeMessage(message: RuntimeConsoleMessage): ConsoleMessage {
    const stackFrames = message.stackTrace?.callFrames || [];
    const firstFrame = stackFrames[0];

    return {
      id: this.nextId++,
      source: "runtime",
      type: message.type || "log",
      level: message.type || "log",
      text: (message.args || []).map((arg) => stringifyRemoteArg(arg)).join(" ").trim(),
      timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
      url: firstFrame?.url,
      stackTrace: formatStackTrace(stackFrames),
    };
  }

  private createAddedMessage(source: "console" | "log", message: AddedConsoleMessage): ConsoleMessage {
    const line = typeof message.line === "number" ? message.line : undefined;
    const column = typeof message.column === "number" ? message.column : undefined;
    const location = message.url && line !== undefined ? `${message.url}:${line}${column !== undefined ? `:${column}` : ""}` : undefined;

    return {
      id: this.nextId++,
      source,
      type: message.source || source,
      level: message.level || source,
      text: message.text || "",
      timestamp: Date.now(),
      url: location || message.url,
    };
  }
}

function stringifyRemoteArg(arg: { value?: unknown; description?: string; type?: string }): string {
  if (arg.value !== undefined) {
    return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  }

  if (arg.description) {
    return arg.description;
  }

  return arg.type || "unknown";
}

function formatStackTrace(
  callFrames: Array<{ functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }>,
): string | undefined {
  if (callFrames.length === 0) {
    return undefined;
  }

  return callFrames
    .map((frame) => {
      const functionName = frame.functionName || "anonymous";
      const url = frame.url || "unknown";
      const line = typeof frame.lineNumber === "number" ? frame.lineNumber : 0;
      const column = typeof frame.columnNumber === "number" ? frame.columnNumber : 0;
      return `${functionName} (${url}:${line}:${column})`;
    })
    .join("\n");
}
