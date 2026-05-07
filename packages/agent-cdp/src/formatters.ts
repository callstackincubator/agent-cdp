import type { ConsoleMessage, StatusInfo, TraceRecordingSummary } from "./types.js";

export function formatStatus(info: StatusInfo, verbose = false): string {
  if (verbose) {
    const lines = [
      `Daemon: ${info.daemonRunning ? "running" : "stopped"}`,
      `Uptime: ${Math.max(0, Math.round(info.uptime / 1000))}s`,
      `Providers: ${info.providerCount}`,
      `Session: ${info.sessionState}`,
      `Trace: ${info.tracingActive ? "active" : "idle"}`,
    ];
    if (info.selectedTarget) {
      lines.push(`Target: ${info.selectedTarget.kind} ${info.selectedTarget.title} (${info.selectedTarget.id})`);
    } else {
      lines.push("Target: none selected");
    }
    return lines.join("\n");
  }

  const target = info.selectedTarget
    ? `target:${info.selectedTarget.kind} ${info.selectedTarget.title} (${info.selectedTarget.id})`
    : "no target";
  return `${info.daemonRunning ? "running" : "stopped"} | session:${info.sessionState} | trace:${info.tracingActive ? "active" : "idle"} | ${target}`;
}

export function formatTargetList(targets: Array<NonNullable<StatusInfo["selectedTarget"]>>, verbose = false): string {
  if (targets.length === 0) {
    return "No targets found";
  }

  if (verbose) {
    return targets
      .map((target) => {
        return `${target.id}\n  ${target.kind} ${target.title}\n  ${target.description}\n  ${target.webSocketDebuggerUrl}`;
      })
      .join("\n");
  }

  return targets.map((t) => `${t.id}  ${t.kind}  ${t.title}`).join("\n");
}

export function formatConsoleList(messages: ConsoleMessage[]): string {
  if (messages.length === 0) {
    return "No console messages";
  }

  return messages
    .map((message) => {
      return `#${message.id} [${message.source}:${message.level}] ${message.text}`;
    })
    .join("\n");
}

export function formatConsoleMessage(message: ConsoleMessage, verbose = false): string {
  if (verbose) {
    const lines = [`#${message.id}`, `Source: ${message.source}`, `Level: ${message.level}`, `Type: ${message.type}`];
    if (message.url) lines.push(`URL: ${message.url}`);
    lines.push(`Text: ${message.text}`);
    if (message.stackTrace) {
      lines.push("Stack:");
      lines.push(message.stackTrace);
    }
    return lines.join("\n");
  }

  const lines = [`#${message.id} [${message.source}:${message.level}] (${message.type})`];
  if (message.url) lines.push(message.url);
  lines.push(message.text);
  if (message.stackTrace) lines.push(message.stackTrace);
  return lines.join("\n");
}

export function formatTraceSummary(summary: TraceRecordingSummary, verbose = false): string {
  if (verbose) {
    const lines = [`Trace events: ${summary.eventCount}`];
    if (summary.filePath) lines.push(`Saved to: ${summary.filePath}`);
    return lines.join("\n");
  }

  return summary.filePath ? `saved ${summary.filePath} (${summary.eventCount} events)` : `${summary.eventCount} events`;
}
