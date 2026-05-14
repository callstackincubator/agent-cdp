import type {
  NetworkHeaderEntry,
  NetworkHeaderResult,
  NetworkListOptions,
  NetworkListResult,
  NetworkRequest,
  NetworkSession,
  NetworkSummaryResult,
} from "./types.js";

export function querySummary(requests: NetworkRequest[], source: "live" | "session", sessionId?: string): NetworkSummaryResult {
  const completed = requests.filter((request) => request.state === "completed");
  const failed = requests.filter((request) => request.state === "failed");
  const pending = requests.filter((request) => request.state === "pending");
  const countsByType = countAndSort(requests.map((request) => request.resourceType || "other"), "type");
  const countsByStatusBucket = countAndSort(requests.map((request) => toStatusBucket(request.statusCode, request.state)), "bucket");
  const slowest = [...requests]
    .filter((request) => typeof request.durationMs === "number")
    .sort((left, right) => (right.durationMs || 0) - (left.durationMs || 0))
    .slice(0, 5)
    .map(({ id, method, url, durationMs }) => ({ id, method, url, durationMs }));
  const largest = [...requests]
    .filter((request) => typeof request.encodedDataLength === "number")
    .sort((left, right) => (right.encodedDataLength || 0) - (left.encodedDataLength || 0))
    .slice(0, 5)
    .map(({ id, method, url, encodedDataLength }) => ({ id, method, url, encodedDataLength }));

  const evidence: string[] = [];
  if (failed.length > 0) {
    evidence.push(`${failed.length} failed request${failed.length === 1 ? "" : "s"}`);
  }
  if (slowest[0]?.durationMs && slowest[0].durationMs >= 1000) {
    evidence.push(`slowest request took ${Math.round(slowest[0].durationMs)}ms`);
  }
  if (largest[0]?.encodedDataLength && largest[0].encodedDataLength >= 1024 * 1024) {
    evidence.push(`largest response transferred ${formatBytes(largest[0].encodedDataLength)}`);
  }
  if (pending.length > 0) {
    evidence.push(`${pending.length} request${pending.length === 1 ? " is" : "s are"} still pending`);
  }

  return {
    source,
    sessionId,
    requestCount: requests.length,
    completedCount: completed.length,
    failedCount: failed.length,
    pendingCount: pending.length,
    countsByType,
    countsByStatusBucket,
    slowest,
    largest,
    availability: {
      requestHeaders: requests.filter((request) => request.hasRequestHeaders).length,
      responseHeaders: requests.filter((request) => request.hasResponseHeaders).length,
      requestBodies: requests.filter((request) => request.hasRequestBody).length,
      responseBodies: requests.filter((request) => request.hasResponseBody).length,
    },
    evidence,
  };
}

export function queryList(requests: NetworkRequest[], source: "live" | "session", options: NetworkListOptions): NetworkListResult {
  const filtered = requests.filter((request) => matchesFilters(request, options));
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  return {
    source,
    sessionId: options.sessionId,
    total: filtered.length,
    limit,
    offset,
    items: filtered.slice(offset, offset + limit),
  };
}

export function queryRequest(
  session: Pick<NetworkSession, "requests"> | null,
  liveRequests: NetworkRequest[],
  requestId: string,
): NetworkRequest {
  const scoped = session ? session.requests : liveRequests;
  const request = scoped.find((candidate) => candidate.id === requestId);
  if (!request) {
    throw new Error(`Network request ${requestId} not found`);
  }
  return request;
}

export function queryHeaders(
  request: NetworkRequest,
  kind: "request" | "response",
  filterName?: string,
): NetworkHeaderResult {
  const headers = kind === "request" ? request.requestHeaders : request.responseHeaders;
  const entries = Object.entries(headers || {})
    .map(([name, value]) => ({ name, value }))
    .filter((entry) => matchesHeaderName(entry, filterName));

  return {
    requestId: request.id,
    sessionId: request.sessionId,
    kind,
    available: kind === "request" ? request.hasRequestHeaders : request.hasResponseHeaders,
    entries,
  };
}

function matchesFilters(request: NetworkRequest, options: NetworkListOptions): boolean {
  if (options.type && request.resourceType.toLowerCase() !== options.type.toLowerCase()) {
    return false;
  }
  if (options.method && request.method.toLowerCase() !== options.method.toLowerCase()) {
    return false;
  }
  if (options.status && !matchesStatusFilter(request, options.status)) {
    return false;
  }
  if (options.text) {
    const text = options.text.toLowerCase();
    if (!request.url.toLowerCase().includes(text) && !request.method.toLowerCase().includes(text)) {
      return false;
    }
  }
  if (typeof options.minMs === "number" && (request.durationMs ?? -Infinity) < options.minMs) {
    return false;
  }
  if (typeof options.maxMs === "number" && (request.durationMs ?? Infinity) > options.maxMs) {
    return false;
  }
  if (typeof options.minBytes === "number" && (request.encodedDataLength ?? -Infinity) < options.minBytes) {
    return false;
  }
  if (typeof options.maxBytes === "number" && (request.encodedDataLength ?? Infinity) > options.maxBytes) {
    return false;
  }
  return true;
}

function matchesStatusFilter(request: NetworkRequest, status: string): boolean {
  const normalized = status.toLowerCase();
  if (normalized === "failed") {
    return request.state === "failed";
  }
  if (normalized === "pending") {
    return request.state === "pending";
  }
  const code = request.statusCode;
  if (typeof code === "number") {
    if (normalized.endsWith("xx") && normalized.length === 3) {
      return Math.floor(code / 100) === Number.parseInt(normalized[0] || "0", 10);
    }
    return String(code) === normalized;
  }
  return false;
}

function matchesHeaderName(entry: NetworkHeaderEntry, filterName?: string): boolean {
  if (!filterName) {
    return true;
  }
  return entry.name.toLowerCase().includes(filterName.toLowerCase());
}

function countAndSort<TField extends string>(values: string[], field: TField): Array<Record<TField, string> & { count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ [field]: value, count }) as Record<TField, string> & { count: number });
}

function toStatusBucket(statusCode: number | undefined, state: NetworkRequest["state"]): string {
  if (state === "failed") return "failed";
  if (state === "pending") return "pending";
  if (typeof statusCode !== "number") return "unknown";
  return `${Math.floor(statusCode / 100)}xx`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
