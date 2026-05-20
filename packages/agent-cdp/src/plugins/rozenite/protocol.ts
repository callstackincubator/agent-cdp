export const RUNTIME_GLOBAL = "__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__";
export const DOMAIN_NAME = "rozenite";
export const POLL_INTERVAL_MS = 500;
export const POLL_TIMEOUT_MS = 30_000;

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: object;
}

export type AppToAgentMessage =
  | { type: "register-tool"; tools: AgentTool[] }
  | { type: "unregister-tool"; toolNames: string[] }
  | { type: "tool-result"; callId: string; success: true; result: unknown }
  | { type: "tool-result"; callId: string; success: false; error: string };

export type AgentToAppMessage =
  | { type: "agent-session-ready" }
  | { type: "tool-call"; callId: string; toolName: string; arguments: unknown };

export interface BindingPayload {
  domain: string;
  message: unknown;
}