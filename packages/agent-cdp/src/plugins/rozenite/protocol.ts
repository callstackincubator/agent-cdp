export const RUNTIME_GLOBAL = "__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__";
export const ROZENITE_DOMAIN = "rozenite";
export const AGENT_PLUGIN_ID = "rozenite-agent";
export const BOOTSTRAP_POLL_INTERVAL_MS = 250;
export const BOOTSTRAP_POLL_MAX_ATTEMPTS = 40;

export interface RozeniteRegisteredTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface RozeniteDevToolsMessage {
  pluginId: string;
  type: string;
  payload: unknown;
}

export interface RozeniteRegisterToolPayload {
  tools: RozeniteRegisteredTool[];
}

export interface RozeniteUnregisterToolPayload {
  toolNames: string[];
}

export interface RozeniteToolResultPayload {
  callId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface RozeniteToolCallPayload {
  callId: string;
  toolName: string;
  arguments: unknown;
}

export interface RozeniteAgentSessionReadyPayload {
  sessionId: string;
}