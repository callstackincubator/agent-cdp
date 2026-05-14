import { ensureDaemon, sendCommand, stopDaemon } from "../daemon-client.js";
import type { DiscoveryOptions, IpcCommand, IpcResponse, StatusInfo, TargetDescriptor } from "../types.js";

export interface CliDeps {
  ensureDaemon: typeof ensureDaemon;
  sendCommand: (command: IpcCommand) => Promise<IpcResponse>;
  stopDaemon: typeof stopDaemon;
}

export const defaultCliDeps: CliDeps = {
  ensureDaemon,
  sendCommand,
  stopDaemon,
};

export const MULTIPLE_TARGETS_AVAILABLE_MESSAGE =
  "Multiple targets available. Run 'agent-cdp target list' and 'agent-cdp target select <id>'.";

export async function ensureTargetSelected(deps: CliDeps = defaultCliDeps): Promise<void> {
  await deps.ensureDaemon();

  const statusResponse = await deps.sendCommand({ type: "status" });
  if (!statusResponse.ok) {
    throw new Error(statusResponse.error || "Failed to load daemon status");
  }

  if (readStatusInfo(statusResponse.data).selectedTarget) {
    return;
  }

  const targetsResponse = await deps.sendCommand({ type: "list-targets", options: {} });
  if (!targetsResponse.ok) {
    throw new Error(targetsResponse.error || "Failed to list targets");
  }

  const targets = readTargets(targetsResponse.data);
  if (targets.length === 0) {
    return;
  }

  if (targets.length > 1) {
    throw new Error(MULTIPLE_TARGETS_AVAILABLE_MESSAGE);
  }

  const target = targets[0];
  const selectResponse = await deps.sendCommand({
    type: "select-target",
    targetId: target.id,
    options: {},
  });
  if (!selectResponse.ok) {
    throw new Error(selectResponse.error || "Failed to auto-select target");
  }
}

export function discoveryOptions(url?: string): DiscoveryOptions {
  return { url };
}

export function readStatusInfo(data: unknown): StatusInfo {
  return data as StatusInfo;
}

export function readTargets(data: unknown): TargetDescriptor[] {
  return data as TargetDescriptor[];
}
