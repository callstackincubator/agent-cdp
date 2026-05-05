import type { CdpEventMessage, RuntimeSession } from "../types.js";
import type { NetworkRequest } from "./types.js";

interface NetworkResponsePayload {
  url?: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  protocol?: string;
  remoteIPAddress?: string;
  remotePort?: number;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  headers?: Record<string, unknown>;
}

interface TrackedRequest {
  request: NetworkRequest;
  wallTimeMs?: number;
}

export class NetworkCapture {
  private requests = new Map<string, TrackedRequest>();
  private unsubscribe: (() => void) | null = null;
  private session: RuntimeSession | null = null;
  private attached = false;

  constructor(
    private readonly createRequestId: () => string,
    private readonly onRequestUpdated: (request: NetworkRequest, isNew: boolean) => void,
    private readonly onNavigation: () => void,
  ) {}

  async attach(session: RuntimeSession): Promise<void> {
    this.detach();
    this.session = session;
    this.requests = new Map();
    this.unsubscribe = session.transport.onEvent((message) => {
      this.handleEvent(message);
    });

    await Promise.allSettled([session.transport.send("Network.enable"), session.transport.send("Page.enable")]);
    this.attached = true;
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.session = null;
    this.requests = new Map();
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  async getRequestBody(request: NetworkRequest): Promise<{ text: string; base64Encoded: boolean }> {
    if (request.requestBody) {
      return request.requestBody;
    }
    if (!this.session) {
      throw new Error("Request body is unavailable after the target disconnects");
    }

    const result = (await this.session.transport.send("Network.getRequestPostData", {
      requestId: request.rawRequestId,
    })) as { postData?: string };
    if (typeof result.postData !== "string") {
      throw new Error("Request body unavailable");
    }
    request.requestBody = { text: result.postData, base64Encoded: false };
    request.hasRequestBody = true;
    return request.requestBody;
  }

  async getResponseBody(request: NetworkRequest): Promise<{ text: string; base64Encoded: boolean }> {
    if (request.responseBody) {
      return request.responseBody;
    }
    if (!this.session) {
      throw new Error("Response body is unavailable after the target disconnects");
    }

    const result = (await this.session.transport.send("Network.getResponseBody", {
      requestId: request.rawRequestId,
    })) as { body?: string; base64Encoded?: boolean };
    if (typeof result.body !== "string") {
      throw new Error("Response body unavailable");
    }
    request.responseBody = { text: result.body, base64Encoded: result.base64Encoded === true };
    request.hasResponseBody = true;
    return request.responseBody;
  }

  private handleEvent(message: CdpEventMessage): void {
    if (message.method === "Page.frameNavigated") {
      const frame = message.params?.frame as { parentId?: string } | undefined;
      if (frame && !frame.parentId) {
        this.onNavigation();
      }
      return;
    }

    if (message.method === "Network.requestWillBeSent") {
      this.handleRequestWillBeSent(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.requestWillBeSentExtraInfo") {
      this.handleRequestExtraInfo(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.responseReceived") {
      this.handleResponseReceived(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.responseReceivedExtraInfo") {
      this.handleResponseExtraInfo(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.loadingFinished") {
      this.handleLoadingFinished(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.loadingFailed") {
      this.handleLoadingFailed(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.webSocketCreated") {
      this.handleWebSocketCreated(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.webSocketWillSendHandshakeRequest") {
      this.handleWebSocketHandshakeRequest(message.params as Record<string, unknown>);
      return;
    }

    if (message.method === "Network.webSocketHandshakeResponseReceived") {
      this.handleWebSocketHandshakeResponse(message.params as Record<string, unknown>);
    }
  }

  private handleRequestWillBeSent(params: Record<string, unknown>): void {
    const rawRequestId = String(params.requestId || "");
    const requestPayload = (params.request || {}) as Record<string, unknown>;
    const url = typeof requestPayload.url === "string" ? requestPayload.url : "unknown";
    const method = typeof requestPayload.method === "string" ? requestPayload.method : "UNKNOWN";
    const timestampMs = toMonotonicMs(params.timestamp);
    const wallTimeMs = toWallTimeMs(params.wallTime) ?? Date.now();
    const resourceType = typeof params.type === "string" ? params.type : "other";
    const redirectResponse = params.redirectResponse as NetworkResponsePayload | undefined;
    const existing = this.requests.get(rawRequestId);

    let redirectChain = existing?.request.redirectChain ? [...existing.request.redirectChain] : [];
    if (redirectResponse && existing) {
      existing.request.state = "completed";
      existing.request.statusCode = redirectResponse.status;
      existing.request.statusText = redirectResponse.statusText;
      existing.request.mimeType = redirectResponse.mimeType;
      existing.request.protocol = redirectResponse.protocol;
      existing.request.responseHeaders = normalizeHeaders(redirectResponse.headers);
      existing.request.hasResponseHeaders = Boolean(existing.request.responseHeaders);
      existing.request.redirectedTo = url;
      existing.request.endedAt = wallTimeMs;
      existing.request.durationMs = Math.max(0, wallTimeMs - existing.request.startedAt);
      redirectChain = [...redirectChain, { url: existing.request.url, statusCode: redirectResponse.status, statusText: redirectResponse.statusText }];
    }

    const tracked = existing && !redirectResponse ? existing : this.createTrackedRequest(rawRequestId);
    tracked.request.url = url;
    tracked.request.method = method;
    tracked.request.resourceType = resourceType;
    tracked.request.startedAt = wallTimeMs;
    tracked.request.state = "pending";
    tracked.request.redirectChain = redirectChain;
    tracked.request.navigationId = typeof params.loaderId === "string" ? params.loaderId : tracked.request.navigationId;
    tracked.request.isNavigationRequest = params.documentURL === url;
    tracked.wallTimeMs = wallTimeMs - timestampMs;

    const requestHeaders = normalizeHeaders(requestPayload.headers as Record<string, unknown> | undefined);
    if (requestHeaders) {
      tracked.request.requestHeaders = requestHeaders;
      tracked.request.hasRequestHeaders = true;
    }
    if (typeof requestPayload.postData === "string") {
      tracked.request.requestBody = { text: requestPayload.postData, base64Encoded: false };
      tracked.request.hasRequestBody = true;
    }

    this.onRequestUpdated(tracked.request, !existing || Boolean(redirectResponse));
  }

  private handleRequestExtraInfo(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const headers = normalizeHeaders(params.headers as Record<string, unknown> | undefined);
    if (headers) {
      tracked.request.requestHeaders = headers;
      tracked.request.hasRequestHeaders = true;
      this.onRequestUpdated(tracked.request, false);
    }
  }

  private handleResponseReceived(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const response = (params.response || {}) as NetworkResponsePayload;
    tracked.request.statusCode = response.status;
    tracked.request.statusText = response.statusText;
    tracked.request.resourceType = typeof params.type === "string" ? params.type : tracked.request.resourceType;
    tracked.request.mimeType = response.mimeType;
    tracked.request.protocol = response.protocol;
    tracked.request.remoteAddress = formatRemoteAddress(response.remoteIPAddress, response.remotePort);
    tracked.request.fromDiskCache = response.fromDiskCache;
    tracked.request.fromServiceWorker = response.fromServiceWorker;
    const headers = normalizeHeaders(response.headers);
    if (headers) {
      tracked.request.responseHeaders = headers;
      tracked.request.hasResponseHeaders = true;
    }
    this.onRequestUpdated(tracked.request, false);
  }

  private handleResponseExtraInfo(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    if (typeof params.statusCode === "number") {
      tracked.request.statusCode = params.statusCode;
    }
    const headers = normalizeHeaders(params.headers as Record<string, unknown> | undefined);
    if (headers) {
      tracked.request.responseHeaders = headers;
      tracked.request.hasResponseHeaders = true;
    }
    this.onRequestUpdated(tracked.request, false);
  }

  private handleLoadingFinished(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const endedAt = estimateWallTime(tracked, params.timestamp) ?? Date.now();
    tracked.request.state = "completed";
    tracked.request.endedAt = endedAt;
    tracked.request.durationMs = Math.max(0, endedAt - tracked.request.startedAt);
    tracked.request.encodedDataLength = typeof params.encodedDataLength === "number" ? params.encodedDataLength : tracked.request.encodedDataLength;
    tracked.request.hasResponseBody = true;
    this.onRequestUpdated(tracked.request, false);
  }

  private handleLoadingFailed(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const endedAt = estimateWallTime(tracked, params.timestamp) ?? Date.now();
    tracked.request.state = "failed";
    tracked.request.failureText = typeof params.errorText === "string" ? params.errorText : "Unknown network failure";
    tracked.request.endedAt = endedAt;
    tracked.request.durationMs = Math.max(0, endedAt - tracked.request.startedAt);
    this.onRequestUpdated(tracked.request, false);
  }

  private handleWebSocketCreated(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    tracked.request.url = typeof params.url === "string" ? params.url : tracked.request.url;
    tracked.request.method = "GET";
    tracked.request.resourceType = "websocket";
    tracked.request.isWebSocket = true;
    this.onRequestUpdated(tracked.request, false);
  }

  private handleWebSocketHandshakeRequest(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const request = (params.request || {}) as Record<string, unknown>;
    tracked.request.isWebSocket = true;
    tracked.request.method = "GET";
    tracked.request.resourceType = "websocket";
    const headers = normalizeHeaders(request.headers as Record<string, unknown> | undefined);
    if (headers) {
      tracked.request.requestHeaders = headers;
      tracked.request.hasRequestHeaders = true;
    }
    this.onRequestUpdated(tracked.request, false);
  }

  private handleWebSocketHandshakeResponse(params: Record<string, unknown>): void {
    const tracked = this.getOrCreateTrackedRequest(String(params.requestId || ""));
    const response = (params.response || {}) as Record<string, unknown>;
    tracked.request.isWebSocket = true;
    tracked.request.state = "completed";
    tracked.request.statusCode = typeof response.status === "number" ? response.status : tracked.request.statusCode;
    tracked.request.statusText = typeof response.statusText === "string" ? response.statusText : tracked.request.statusText;
    tracked.request.webSocketHandshake = {
      statusCode: tracked.request.statusCode,
      statusText: tracked.request.statusText,
    };
    const headers = normalizeHeaders(response.headers as Record<string, unknown> | undefined);
    if (headers) {
      tracked.request.responseHeaders = headers;
      tracked.request.hasResponseHeaders = true;
    }
    this.onRequestUpdated(tracked.request, false);
  }

  private createTrackedRequest(rawRequestId: string): TrackedRequest {
    const request: NetworkRequest = {
      id: this.createRequestId(),
      rawRequestId,
      source: "live",
      url: "unknown",
      method: "UNKNOWN",
      resourceType: "other",
      state: "pending",
      startedAt: Date.now(),
      hasRequestHeaders: false,
      hasResponseHeaders: false,
      hasRequestBody: false,
      hasResponseBody: false,
      redirectChain: [],
      isNavigationRequest: false,
      isWebSocket: false,
    };
    const tracked = { request };
    this.requests.set(rawRequestId, tracked);
    return tracked;
  }

  private getOrCreateTrackedRequest(rawRequestId: string): TrackedRequest {
    const existing = this.requests.get(rawRequestId);
    if (existing) {
      return existing;
    }
    const tracked = this.createTrackedRequest(rawRequestId);
    this.onRequestUpdated(tracked.request, true);
    return tracked;
  }
}

function normalizeHeaders(headers?: Record<string, unknown>): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const out = Object.entries(headers).reduce<Record<string, string>>((acc, [name, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }
    acc[name] = String(value);
    return acc;
  }, {});
  return Object.keys(out).length > 0 ? out : undefined;
}

function toMonotonicMs(value: unknown): number {
  return typeof value === "number" ? value * 1000 : 0;
}

function toWallTimeMs(value: unknown): number | undefined {
  return typeof value === "number" ? value * 1000 : undefined;
}

function estimateWallTime(tracked: TrackedRequest, timestamp: unknown): number | undefined {
  if (typeof timestamp !== "number") {
    return undefined;
  }
  if (typeof tracked.wallTimeMs !== "number") {
    return undefined;
  }
  return tracked.wallTimeMs + timestamp * 1000;
}

function formatRemoteAddress(ip?: string, port?: number): string | undefined {
  if (!ip) {
    return undefined;
  }
  return typeof port === "number" ? `${ip}:${port}` : ip;
}
