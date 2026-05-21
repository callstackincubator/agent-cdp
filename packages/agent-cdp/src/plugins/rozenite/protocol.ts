export const ROZENITE_AGENT_BASE = "/rozenite/agent";

export interface RozeniteApiTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface RozeniteSessionInfo {
  id: string;
  deviceId: string;
  deviceName: string;
  status: string;
  toolCount: number;
  createdAt: number;
  lastActivityAt: number;
  connectedAt?: number;
  lastError?: string;
}

export interface RozeniteApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: { message: string };
}