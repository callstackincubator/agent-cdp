import { ConsoleCollector } from "../console.js";
import { formatConsoleList, formatConsoleMessage } from "../formatters.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeConsoleTransport implements CdpTransport {
  private listener: ((message: CdpEventMessage) => void) | null = null;
  readonly sentMethods: string[] = [];

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  send(method: string): Promise<unknown> {
    this.sentMethods.push(method);
    return Promise.resolve(undefined);
  }

  onEvent(listener: (message: CdpEventMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(message: CdpEventMessage): void {
    this.listener?.(message);
  }
}

function createSession(transport: CdpTransport): RuntimeSession {
  return {
    target: {
      id: "chrome:test:page-1",
      rawId: "page-1",
      title: "Example",
      kind: "chrome",
      description: "Test page",
      webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
      sourceUrl: "http://example.test",
    } satisfies TargetDescriptor,
    transport,
    ensureConnected: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

describe("ConsoleCollector", () => {
  it("enables console-related domains on attach", async () => {
    const transport = new FakeConsoleTransport();
    const collector = new ConsoleCollector();

    await collector.attach(createSession(transport));

    expect(transport.sentMethods).toEqual(["Runtime.enable", "Console.enable", "Log.enable"]);
  });

  it("collects and formats runtime console messages", async () => {
    const transport = new FakeConsoleTransport();
    const collector = new ConsoleCollector();

    await collector.attach(createSession(transport));
    transport.emit({
      method: "Runtime.consoleAPICalled",
      params: {
        type: "error",
        args: [{ value: "boom" }],
        stackTrace: {
          callFrames: [{ functionName: "render", url: "app.js", lineNumber: 12, columnNumber: 4 }],
        },
      },
    });

    const [message] = collector.list();
    expect(formatConsoleList([message])).toContain("boom");
    expect(formatConsoleMessage(message)).toContain("render (app.js:12:4)");
  });
});
