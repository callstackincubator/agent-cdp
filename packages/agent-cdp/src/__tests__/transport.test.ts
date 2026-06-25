import type { TargetDescriptor } from "@agent-cdp/protocol";

import { WebSocketCdpTransport } from "../transport.js";

const { webSocketCalls } = vi.hoisted(() => ({
  webSocketCalls: [] as Array<{ url: string; options: unknown }>,
}));

vi.mock("ws", () => {
  class MockWebSocket {
    static readonly OPEN = 1;
    readonly readyState = MockWebSocket.OPEN;

    constructor(url: string, options?: unknown) {
      webSocketCalls.push({ url, options });
    }

    once(event: string, listener: () => void): void {
      if (event === "open") {
        queueMicrotask(listener);
      }
    }

    on(): void {}
    close(): void {}
    send(): void {}
  }

  return { default: MockWebSocket };
});

describe("WebSocketCdpTransport", () => {
  beforeEach(() => {
    webSocketCalls.length = 0;
  });

  it("connects to chrome targets without custom websocket headers", async () => {
    await new WebSocketCdpTransport(makeTarget({ kind: "chrome", sourceUrl: "http://127.0.0.1:9222" })).connect();

    expect(webSocketCalls).toEqual([{ url: "ws://127.0.0.1:9222/devtools/page/1", options: undefined }]);
  });

  it("sends the Metro discovery origin when connecting to React Native targets", async () => {
    await new WebSocketCdpTransport(
      makeTarget({
        kind: "react-native",
        sourceUrl: "http://127.0.0.1:8081",
        webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=1&page=2",
      }),
    ).connect();

    expect(webSocketCalls).toEqual([
      {
        url: "ws://127.0.0.1:8081/inspector/debug?device=1&page=2",
        options: { headers: { Origin: "http://127.0.0.1:8081" } },
      },
    ]);
  });
});

function makeTarget(overrides: Partial<TargetDescriptor>): TargetDescriptor {
  return {
    id: "target-1",
    rawId: "page-1",
    title: "Example",
    kind: "chrome",
    description: "Example target",
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1",
    sourceUrl: "http://127.0.0.1:9222",
    ...overrides,
  };
}
