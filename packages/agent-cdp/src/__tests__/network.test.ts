import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NetworkCapture } from "../network/capture.js";
import {
  formatNetworkBody,
  formatNetworkHeaders,
  formatNetworkList,
  formatNetworkRequest,
  formatNetworkSummary,
} from "../network/formatters.js";
import { NetworkManager } from "../network/index.js";
import { queryHeaders, queryList, querySummary } from "../network/query.js";
import { NetworkStore } from "../network/store.js";
import type { NetworkRequest } from "../network/types.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeNetworkTransport implements CdpTransport {
  private listener: ((message: CdpEventMessage) => void) | null = null;
  readonly sentMethods: string[] = [];
  connected = true;

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sentMethods.push(method);
    if (method === "Network.getResponseBody") {
      return Promise.resolve({ body: "response-body", base64Encoded: false });
    }
    if (method === "Network.getRequestPostData") {
      return Promise.resolve({ postData: `request:${String(params?.requestId || "")}` });
    }
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

function createRequest(id: string, overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    id,
    rawRequestId: `raw-${id}`,
    source: "live",
    url: `https://example.test/${id}`,
    method: "GET",
    resourceType: "xhr",
    state: "completed",
    statusCode: 200,
    startedAt: 1_000,
    endedAt: 1_250,
    durationMs: 250,
    encodedDataLength: 2_048,
    hasRequestHeaders: true,
    hasResponseHeaders: true,
    hasRequestBody: false,
    hasResponseBody: true,
    requestHeaders: { accept: "application/json" },
    responseHeaders: { "content-type": "application/json" },
    responseBody: { text: "{}", base64Encoded: false },
    redirectChain: [],
    isNavigationRequest: false,
    isWebSocket: false,
    ...overrides,
  };
}

describe("network capture", () => {
  it("normalizes request lifecycles, redirects, failures, and websocket handshakes", async () => {
    const transport = new FakeNetworkTransport();
    const store = new NetworkStore();
    const capture = new NetworkCapture(
      () => store.generateRequestId(),
      (request, isNew) => store.record(request, isNew),
      () => store.handleNavigation(),
    );

    await capture.attach(createSession(transport));

    expect(transport.sentMethods).toEqual(["Network.enable", "Page.enable"]);

    transport.emit({
      method: "Network.requestWillBeSent",
      params: {
        requestId: "1",
        timestamp: 1,
        wallTime: 10,
        type: "XHR",
        documentURL: "https://example.test/api",
        request: {
          url: "https://example.test/api",
          method: "POST",
          headers: { accept: "application/json" },
          postData: '{"a":1}',
        },
      },
    });
    transport.emit({
      method: "Network.responseReceived",
      params: {
        requestId: "1",
        type: "XHR",
        response: {
          status: 200,
          statusText: "OK",
          mimeType: "application/json",
          protocol: "h2",
          remoteIPAddress: "127.0.0.1",
          remotePort: 443,
          headers: { "content-type": "application/json" },
        },
      },
    });
    transport.emit({ method: "Network.loadingFinished", params: { requestId: "1", timestamp: 1.2, encodedDataLength: 2048 } });

    transport.emit({
      method: "Network.requestWillBeSent",
      params: {
        requestId: "2",
        timestamp: 2,
        wallTime: 20,
        type: "Document",
        request: {
          url: "https://example.test/redirect-a",
          method: "GET",
        },
      },
    });
    transport.emit({
      method: "Network.requestWillBeSent",
      params: {
        requestId: "2",
        timestamp: 2.1,
        wallTime: 20.1,
        type: "Document",
        request: {
          url: "https://example.test/redirect-b",
          method: "GET",
        },
        redirectResponse: {
          status: 302,
          statusText: "Found",
          headers: { location: "https://example.test/redirect-b" },
        },
      },
    });

    transport.emit({
      method: "Network.loadingFailed",
      params: { requestId: "3", timestamp: 3.5, errorText: "net::ERR_FAILED" },
    });

    transport.emit({ method: "Network.webSocketCreated", params: { requestId: "4", url: "wss://example.test/socket" } });
    transport.emit({
      method: "Network.webSocketWillSendHandshakeRequest",
      params: {
        requestId: "4",
        request: { headers: { upgrade: "websocket" } },
      },
    });
    transport.emit({
      method: "Network.webSocketHandshakeResponseReceived",
      params: {
        requestId: "4",
        response: { status: 101, statusText: "Switching Protocols", headers: { connection: "Upgrade" } },
      },
    });

    const requests = store.getLiveRequests();
    expect(requests).toHaveLength(5);
    expect(requests.find((request) => request.url.endsWith("/api"))).toMatchObject({
      method: "POST",
      state: "completed",
      statusCode: 200,
      hasRequestBody: true,
      hasResponseBody: true,
      remoteAddress: "127.0.0.1:443",
    });
    expect(requests.find((request) => request.url.endsWith("redirect-a"))?.redirectedTo).toBe(
      "https://example.test/redirect-b",
    );
    expect(requests.find((request) => request.url.endsWith("redirect-b"))?.redirectChain).toHaveLength(1);
    expect(requests.find((request) => request.rawRequestId === "3")?.state).toBe("failed");
    expect(requests.find((request) => request.rawRequestId === "4")?.webSocketHandshake?.statusCode).toBe(101);
  });
});

describe("network store", () => {
  it("evicts old live requests and resets non-preserved sessions on navigation", () => {
    const store = new NetworkStore();
    store.startSession("default", false);

    for (let index = 1; index <= 201; index += 1) {
      store.record(createRequest(`req_${index}`), true);
    }

    expect(store.getLiveRequests()).toHaveLength(200);
    expect(store.getLiveRequests().some((request) => request.id === "req_1")).toBe(false);
    expect(store.getActiveSession()?.requests).toHaveLength(201);

    store.handleNavigation();
    expect(store.getActiveSession()?.requests).toHaveLength(0);

    store.stopSession();
    store.startSession("preserved", true);
    store.record(createRequest("req_nav"), true);
    store.handleNavigation();
    expect(store.getActiveSession()?.requests).toHaveLength(1);
  });
});

describe("network queries and formatting", () => {
  it("filters, summarizes, and formats compact output", () => {
    const requests = [
      createRequest("req_1", { url: "https://example.test/api/users", durationMs: 1200, encodedDataLength: 3_000_000 }),
      createRequest("req_2", { state: "failed", statusCode: 500, failureText: "boom", encodedDataLength: 512 }),
      createRequest("req_3", { state: "pending", statusCode: undefined, encodedDataLength: undefined, hasResponseBody: false }),
    ];

    const summary = querySummary(requests, "session", "net_1");
    expect(summary.failedCount).toBe(1);
    expect(formatNetworkSummary(summary, true)).toContain("Signals:");

    const list = queryList(requests, "session", { sessionId: "net_1", status: "failed", limit: 10, offset: 0 });
    expect(list.items).toHaveLength(1);
    expect(formatNetworkList(list)).toContain("req_2");

    const headers = queryHeaders(requests[0], "response", "content");
    expect(headers.entries[0]?.name).toBe("content-type");
    expect(formatNetworkHeaders(headers)).toContain("content-type");

    expect(formatNetworkRequest(requests[0], true)).toContain("Transfer size");
  });
});

describe("network manager bodies", () => {
  it("uses the active session by default and exports response bodies", async () => {
    const transport = new FakeNetworkTransport();
    const manager = new NetworkManager();
    const tempDir = mkdtempSync(path.join(tmpdir(), "agent-cdp-network-"));
    const filePath = path.join(tempDir, "body.txt");

    try {
      await manager.attach(createSession(transport));
      const sessionId = manager.start("capture", false);

      transport.emit({
        method: "Network.requestWillBeSent",
        params: {
          requestId: "body-1",
          timestamp: 1,
          wallTime: 10,
          type: "Fetch",
          request: { url: "https://example.test/body", method: "GET" },
        },
      });
      transport.emit({
        method: "Network.responseReceived",
        params: {
          requestId: "body-1",
          type: "Fetch",
          response: { status: 200, statusText: "OK", mimeType: "text/plain" },
        },
      });
      transport.emit({ method: "Network.loadingFinished", params: { requestId: "body-1", timestamp: 1.1, encodedDataLength: 128 } });

      const summary = manager.getSummary();
      expect(summary.source).toBe("session");
      expect(summary.sessionId).toBe(sessionId);

      const requestId = manager.list({ sessionId }).items[0]?.id;
      expect(requestId).toBeDefined();

      const body = await manager.getResponseBody(requestId || "", sessionId, filePath);
      expect(body.filePath).toBe(filePath);
      expect(readFileSync(filePath, "utf8")).toBe("response-body");
      expect(formatNetworkBody(body)).toContain("Saved response body");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
