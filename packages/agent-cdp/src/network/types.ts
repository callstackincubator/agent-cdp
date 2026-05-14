export const NETWORK_LIVE_BUFFER_LIMIT = 200;

export type NetworkRequestState = "pending" | "completed" | "failed";

export interface NetworkRedirectHop {
  url: string;
  statusCode?: number;
  statusText?: string;
}

export interface NetworkHeaderEntry {
  name: string;
  value: string;
}

export interface NetworkBodyContent {
  text: string;
  base64Encoded: boolean;
}

export interface NetworkBodyUnavailable {
  reason: string;
}

export interface NetworkRequest {
  id: string;
  rawRequestId: string;
  sessionId?: string;
  source: "live" | "session";
  url: string;
  method: string;
  resourceType: string;
  state: NetworkRequestState;
  statusCode?: number;
  statusText?: string;
  failureText?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  encodedDataLength?: number;
  mimeType?: string;
  protocol?: string;
  remoteAddress?: string;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  hasRequestHeaders: boolean;
  hasResponseHeaders: boolean;
  hasRequestBody: boolean;
  hasResponseBody: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: NetworkBodyContent;
  requestBodyUnavailable?: NetworkBodyUnavailable;
  responseBody?: NetworkBodyContent;
  responseBodyUnavailable?: NetworkBodyUnavailable;
  redirectChain: NetworkRedirectHop[];
  redirectedTo?: string;
  navigationId?: string;
  isNavigationRequest: boolean;
  isWebSocket: boolean;
  webSocketHandshake?: {
    statusCode?: number;
    statusText?: string;
  };
}

export interface NetworkSession {
  id: string;
  name?: string;
  startedAt: number;
  stoppedAt?: number;
  preserveAcrossNavigation: boolean;
  requests: NetworkRequest[];
}

export interface NetworkStatusResult {
  attached: boolean;
  liveRequestCount: number;
  liveBufferLimit: number;
  activeSession: {
    id: string;
    name?: string;
    startedAt: number;
    preserveAcrossNavigation: boolean;
    requestCount: number;
  } | null;
  storedSessionCount: number;
}

export interface NetworkSessionListEntry {
  id: string;
  name?: string;
  startedAt: number;
  stoppedAt?: number;
  preserveAcrossNavigation: boolean;
  requestCount: number;
  active: boolean;
}

export interface NetworkSummaryResult {
  source: "live" | "session";
  sessionId?: string;
  requestCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  countsByType: Array<{ type: string; count: number }>;
  countsByStatusBucket: Array<{ bucket: string; count: number }>;
  slowest: Array<Pick<NetworkRequest, "id" | "method" | "url" | "durationMs">>;
  largest: Array<Pick<NetworkRequest, "id" | "method" | "url" | "encodedDataLength">>;
  availability: {
    requestHeaders: number;
    responseHeaders: number;
    requestBodies: number;
    responseBodies: number;
  };
  evidence: string[];
}

export interface NetworkListOptions {
  sessionId?: string;
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
  method?: string;
  text?: string;
  minMs?: number;
  maxMs?: number;
  minBytes?: number;
  maxBytes?: number;
}

export interface NetworkListResult {
  source: "live" | "session";
  sessionId?: string;
  total: number;
  limit: number;
  offset: number;
  items: NetworkRequest[];
}

export interface NetworkHeaderResult {
  requestId: string;
  sessionId?: string;
  kind: "request" | "response";
  available: boolean;
  entries: NetworkHeaderEntry[];
}

export interface NetworkBodyResult {
  requestId: string;
  sessionId?: string;
  kind: "request" | "response";
  available: boolean;
  mimeType?: string;
  base64Encoded?: boolean;
  text?: string;
  filePath?: string;
  bytesWritten?: number;
  reason?: string;
}
