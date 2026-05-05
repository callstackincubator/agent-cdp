import fs from "node:fs/promises";
import path from "node:path";

import type { RuntimeSession } from "../types.js";
import { NetworkCapture } from "./capture.js";
import {
  queryHeaders,
  queryList,
  queryRequest,
  querySummary,
} from "./query.js";
import { NetworkStore } from "./store.js";
import type {
  NetworkBodyResult,
  NetworkHeaderResult,
  NetworkListOptions,
  NetworkListResult,
  NetworkRequest,
  NetworkSessionListEntry,
  NetworkStatusResult,
  NetworkSummaryResult,
} from "./types.js";

export class NetworkManager {
  private readonly store = new NetworkStore();
  private readonly capture = new NetworkCapture(
    () => this.store.generateRequestId(),
    (request, isNew) => this.store.record(request, isNew),
    () => this.store.handleNavigation(),
  );

  async attach(session: RuntimeSession): Promise<void> {
    const shouldCreateInitialSession = !this.store.getLatestSession();
    if (shouldCreateInitialSession) {
      this.store.startSession();
    }

    try {
      await this.capture.attach(session);
    } catch (error) {
      if (shouldCreateInitialSession) {
        this.store.discardActiveSession();
      }
      throw error;
    }
  }

  detach(): void {
    this.capture.detach();
  }

  isAttached(): boolean {
    return this.capture.isAttached();
  }

  start(name?: string, preserveAcrossNavigation = false): string {
    return this.store.startSession(name, preserveAcrossNavigation).id;
  }

  async stop(): Promise<string> {
    const activeSession = this.store.getActiveSession();
    if (!activeSession) {
      throw new Error("No active network session. Run network start first.");
    }

    await Promise.allSettled(
      activeSession.requests
        .filter((request) => request.hasResponseBody && !request.responseBody && request.state === "completed")
        .map((request) => this.capture.getResponseBody(request)),
    );

    return this.store.stopSession().id;
  }

  getStatus(): NetworkStatusResult {
    return this.store.getStatus(this.capture.isAttached());
  }

  listSessions(limit?: number, offset?: number): NetworkSessionListEntry[] {
    return this.store.listSessions(limit, offset);
  }

  getSummary(sessionId?: string): NetworkSummaryResult {
    const resolved = this.resolveSource(sessionId);
    return querySummary(resolved.requests, resolved.source, resolved.sessionId);
  }

  list(options: NetworkListOptions): NetworkListResult {
    const resolved = this.resolveSource(options.sessionId);
    return queryList(resolved.requests, resolved.source, { ...options, sessionId: resolved.sessionId });
  }

  getRequest(requestId: string, sessionId?: string): NetworkRequest {
    const resolved = this.resolveRequestScope(sessionId);
    return queryRequest(resolved.session, resolved.liveRequests, requestId);
  }

  getRequestHeaders(requestId: string, sessionId?: string, name?: string): NetworkHeaderResult {
    return queryHeaders(this.getRequest(requestId, sessionId), "request", name);
  }

  getResponseHeaders(requestId: string, sessionId?: string, name?: string): NetworkHeaderResult {
    return queryHeaders(this.getRequest(requestId, sessionId), "response", name);
  }

  async getRequestBody(requestId: string, sessionId?: string, filePath?: string): Promise<NetworkBodyResult> {
    const request = this.getRequest(requestId, sessionId);
    try {
      const body = await this.capture.getRequestBody(request);
      if (!body) {
        return unavailableBody("request", request, request.requestBodyUnavailable?.reason || "Target did not expose a request body");
      }
      return await this.resolveBodyResult("request", request, body, filePath);
    } catch (error) {
      return unavailableBody("request", request, error instanceof Error ? error.message : String(error));
    }
  }

  async getResponseBody(requestId: string, sessionId?: string, filePath?: string): Promise<NetworkBodyResult> {
    const request = this.getRequest(requestId, sessionId);
    try {
      const body = request.hasResponseBody ? await this.capture.getResponseBody(request) : undefined;
      if (!body) {
        return unavailableBody("response", request, request.responseBodyUnavailable?.reason || "Target did not expose a response body");
      }
      return await this.resolveBodyResult("response", request, body, filePath);
    } catch (error) {
      return unavailableBody("response", request, error instanceof Error ? error.message : String(error));
    }
  }

  private resolveSource(sessionId?: string): { source: "live" | "session"; sessionId?: string; requests: NetworkRequest[] } {
    if (sessionId) {
      const session = this.store.getSession(sessionId);
      if (!session) {
        throw new Error(`Network session ${sessionId} not found`);
      }
      return { source: "session", sessionId: session.id, requests: [...session.requests].reverse() };
    }

    const latestSession = this.store.getLatestSession();
    if (latestSession) {
      return { source: "session", sessionId: latestSession.id, requests: [...latestSession.requests].reverse() };
    }

    return { source: "live", requests: this.store.getLiveRequests() };
  }

  private resolveRequestScope(sessionId?: string): { session: { requests: NetworkRequest[] } | null; liveRequests: NetworkRequest[] } {
    if (sessionId) {
      const session = this.store.getSession(sessionId);
      if (!session) {
        throw new Error(`Network session ${sessionId} not found`);
      }
      return { session, liveRequests: [] };
    }

    const latestSession = this.store.getLatestSession();
    if (latestSession) {
      return { session: latestSession, liveRequests: [] };
    }

    return { session: null, liveRequests: this.store.getLiveRequests() };
  }

  private async resolveBodyResult(
    kind: "request" | "response",
    request: NetworkRequest,
    body: { text: string; base64Encoded: boolean },
    filePath?: string,
  ): Promise<NetworkBodyResult> {
    const normalizedBody = normalizeBodyContent(kind, request, body);

    if (!filePath) {
      return {
        requestId: request.id,
        sessionId: request.sessionId,
        kind,
        available: true,
        mimeType: request.mimeType,
        base64Encoded: normalizedBody.base64Encoded,
        text: normalizedBody.text,
      };
    }

    const outputPath = path.resolve(filePath);
    const buffer = body.base64Encoded ? Buffer.from(body.text, "base64") : Buffer.from(body.text, "utf8");
    await fs.writeFile(outputPath, buffer);
    return {
      requestId: request.id,
      sessionId: request.sessionId,
      kind,
      available: true,
      mimeType: request.mimeType,
      base64Encoded: normalizedBody.base64Encoded,
      filePath: outputPath,
      bytesWritten: buffer.byteLength,
    };
  }
}

function unavailableBody(kind: "request" | "response", request: NetworkRequest, reason: string): NetworkBodyResult {
  return {
    requestId: request.id,
    sessionId: request.sessionId,
    kind,
    available: false,
    reason,
  };
}

function normalizeBodyContent(
  kind: "request" | "response",
  request: NetworkRequest,
  body: { text: string; base64Encoded: boolean },
): { text: string; base64Encoded: boolean } {
  if (!body.base64Encoded) {
    return body;
  }

  const contentType = getBodyContentType(kind, request);
  if (!isTextLikeContentType(contentType)) {
    return body;
  }

  try {
    return {
      text: Buffer.from(body.text, "base64").toString("utf8"),
      base64Encoded: false,
    };
  } catch {
    return body;
  }
}

function getBodyContentType(kind: "request" | "response", request: NetworkRequest): string | undefined {
  const headers = kind === "request" ? request.requestHeaders : request.responseHeaders;
  const headerValue = headers?.["content-type"] || headers?.["Content-Type"];
  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }

  return kind === "response" ? request.mimeType : undefined;
}

function isTextLikeContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("text/")) {
    return true;
  }

  return [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-javascript",
    "application/ecmascript",
    "application/x-www-form-urlencoded",
    "application/graphql",
    "application/problem+json",
    "application/problem+xml",
  ].includes(normalized)
    || normalized.endsWith("+json")
    || normalized.endsWith("+xml");
}

export type {
  NetworkBodyResult,
  NetworkHeaderResult,
  NetworkListResult,
  NetworkRequest,
  NetworkSessionListEntry,
  NetworkStatusResult,
  NetworkSummaryResult,
} from "./types.js";
