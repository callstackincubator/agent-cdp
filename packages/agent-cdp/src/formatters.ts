import type { StatusInfo } from "./types.js";

export function formatStatus(info: StatusInfo): string {
  const lines = [
    `Daemon: ${info.daemonRunning ? "running" : "stopped"}`,
    `Uptime: ${Math.max(0, Math.round(info.uptime / 1000))}s`,
    `Providers: ${info.providerCount}`,
  ];

  if (info.selectedTarget) {
    lines.push(
      `Target: ${info.selectedTarget.kind} ${info.selectedTarget.title} (${info.selectedTarget.id})`,
    );
  } else {
    lines.push("Target: none selected");
  }

  return lines.join("\n");
}
