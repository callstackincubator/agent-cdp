import type {
  NetworkBodyResult,
  NetworkHeaderResult,
  NetworkListResult,
  NetworkRequest,
  NetworkSessionListEntry,
  NetworkStatusResult,
  NetworkSummaryResult,
} from "./types.js";

export function formatNetworkStatus(result: NetworkStatusResult, verbose = false): string {
  if (!verbose) {
    const active = result.activeSession ? `session:${result.activeSession.id}` : "session:none";
    return `${result.attached ? "attached" : "detached"} | live:${result.liveRequestCount}/${result.liveBufferLimit} | ${active} | stored:${result.storedSessionCount}`;
  }

  const lines = [
    `Capture: ${result.attached ? "attached" : "detached"}`,
    `Live buffer: ${result.liveRequestCount}/${result.liveBufferLimit}`,
    `Stored sessions: ${result.storedSessionCount}`,
  ];
  if (result.activeSession) {
    lines.push(`Active session: ${result.activeSession.id}${result.activeSession.name ? ` ${result.activeSession.name}` : ""}`);
    lines.push(`Preserve across navigation: ${result.activeSession.preserveAcrossNavigation ? "yes" : "no"}`);
    lines.push(`Captured requests: ${result.activeSession.requestCount}`);
  } else {
    lines.push("Active session: none");
  }
  return lines.join("\n");
}

export function formatNetworkSessions(entries: NetworkSessionListEntry[], verbose = false): string {
  if (entries.length === 0) {
    return "No network sessions yet. Select a target to start capture.";
  }

  if (!verbose) {
    return entries
      .map((entry) => `${entry.id}${entry.active ? "*" : ""}  ${entry.requestCount} req  ${entry.name || "unnamed"}`)
      .join("\n");
  }

  return entries
    .map((entry) => {
      const lines = [
        `${entry.id}${entry.active ? " (active)" : ""}`,
        `Name: ${entry.name || "unnamed"}`,
        `Requests: ${entry.requestCount}`,
        `Preserve across navigation: ${entry.preserveAcrossNavigation ? "yes" : "no"}`,
      ];
      if (entry.stoppedAt) {
        lines.push(`Duration: ${Math.max(0, Math.round((entry.stoppedAt - entry.startedAt) / 1000))}s`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatNetworkSummary(result: NetworkSummaryResult, verbose = false): string {
  if (result.requestCount === 0) {
    return result.source === "session"
      ? `Session ${result.sessionId || "unknown"} has no captured requests.`
      : "No live network requests captured yet.";
  }

  const lines = [
    `${result.source === "session" ? result.sessionId || "session" : "live buffer"}  total:${result.requestCount} completed:${result.completedCount} failed:${result.failedCount} pending:${result.pendingCount}`,
    `Types: ${renderCounts(result.countsByType, "type")}`,
    `Status: ${renderCounts(result.countsByStatusBucket, "bucket")}`,
  ];
  if (result.slowest.length > 0) {
    lines.push(`Slowest: ${result.slowest.map((request) => `${request.id} ${Math.round(request.durationMs || 0)}ms`).join(", ")}`);
  }
  if (result.largest.length > 0) {
    lines.push(`Largest: ${result.largest.map((request) => `${request.id} ${formatBytes(request.encodedDataLength || 0)}`).join(", ")}`);
  }
  lines.push(
    `Available: req-headers:${result.availability.requestHeaders} res-headers:${result.availability.responseHeaders} req-bodies:${result.availability.requestBodies} res-bodies:${result.availability.responseBodies}`,
  );
  if (verbose && result.evidence.length > 0) {
    lines.push(`Signals: ${result.evidence.join("; ")}`);
  }
  return lines.join("\n");
}

export function formatNetworkList(result: NetworkListResult): string {
  if (result.items.length === 0) {
    return "No matching network requests";
  }

  return result.items.map(formatNetworkListRow).join("\n");
}

export function formatNetworkRequest(request: NetworkRequest, verbose = false): string {
  const lines = [
    `${request.id} ${request.method} ${request.url}`,
    `State: ${request.state}${request.statusCode ? ` ${request.statusCode}${request.statusText ? ` ${request.statusText}` : ""}` : ""}`,
    `Type: ${request.resourceType}`,
  ];
  if (typeof request.durationMs === "number") {
    lines.push(`Duration: ${Math.round(request.durationMs)}ms`);
  }
  if (typeof request.encodedDataLength === "number") {
    lines.push(`Transfer size: ${formatBytes(request.encodedDataLength)}`);
  }
  if (request.failureText) {
    lines.push(`Failure: ${request.failureText}`);
  }
  if (request.redirectChain.length > 0 || request.redirectedTo) {
    lines.push(`Redirects: ${[...request.redirectChain.map((hop) => hop.url), request.redirectedTo].filter(Boolean).join(" -> ")}`);
  }
  lines.push(
    `Available: req-headers:${yesNo(request.hasRequestHeaders)} res-headers:${yesNo(request.hasResponseHeaders)} req-body:${yesNo(request.hasRequestBody)} res-body:${yesNo(request.hasResponseBody)}`,
  );
  if (verbose) {
    if (request.mimeType) lines.push(`MIME: ${request.mimeType}`);
    if (request.protocol) lines.push(`Protocol: ${request.protocol}`);
    if (request.remoteAddress) lines.push(`Remote: ${request.remoteAddress}`);
    if (request.fromDiskCache) lines.push("Served from disk cache");
    if (request.fromServiceWorker) lines.push("Served from service worker");
    if (request.isWebSocket) lines.push("WebSocket visibility is handshake-only in v1");
  }
  return lines.join("\n");
}

export function formatNetworkHeaders(result: NetworkHeaderResult): string {
  if (!result.available) {
    return `${capitalize(result.kind)} headers unavailable`;
  }
  if (result.entries.length === 0) {
    return `No ${result.kind} headers matched`;
  }
  return result.entries.map((entry) => `${entry.name}: ${entry.value}`).join("\n");
}

export function formatNetworkBody(result: NetworkBodyResult): string {
  if (!result.available) {
    return `${capitalize(result.kind)} body unavailable${result.reason ? `: ${result.reason}` : ""}`;
  }
  if (result.filePath) {
    return `Saved ${result.kind} body to ${result.filePath}${typeof result.bytesWritten === "number" ? ` (${result.bytesWritten} bytes)` : ""}`;
  }
  if (!result.text) {
    return `${capitalize(result.kind)} body is empty`;
  }
  if (result.base64Encoded) {
    return `Base64 ${result.kind} body (${result.text.length} chars)\n${result.text}`;
  }
  return result.text;
}

function formatNetworkListRow(request: NetworkRequest): string {
  return [
    request.id,
    request.method,
    renderStatus(request),
    request.resourceType,
    renderDuration(request.durationMs),
    formatBytes(request.encodedDataLength || 0),
    request.url,
  ].join("  ");
}

function renderCounts<TField extends string>(items: Array<Record<TField, string> & { count: number }>, field: TField): string {
  return items.map((item) => `${item[field]}:${item.count}`).join(", ");
}

function renderStatus(request: NetworkRequest): string {
  if (request.state === "failed") return "failed";
  if (request.state === "pending") return "pending";
  return request.statusCode ? String(request.statusCode) : "done";
}

function renderDuration(durationMs: number | undefined): string {
  if (typeof durationMs !== "number") return "-";
  return `${Math.round(durationMs)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
