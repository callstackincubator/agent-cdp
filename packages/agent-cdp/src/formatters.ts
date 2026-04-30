import type { ConsoleMessage, MemorySnapshotSummary, StatusInfo, TraceRecordingSummary } from "./types.js";

export function formatStatus(info: StatusInfo): string {
  const lines = [
    `Daemon: ${info.daemonRunning ? "running" : "stopped"}`,
    `Uptime: ${Math.max(0, Math.round(info.uptime / 1000))}s`,
    `Providers: ${info.providerCount}`,
    `Session: ${info.sessionState}`,
    `Trace: ${info.tracingActive ? "active" : "idle"}`,
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

export function formatTargetList(targets: Array<NonNullable<StatusInfo["selectedTarget"]>>): string {
  if (targets.length === 0) {
    return "No targets found";
  }

  return targets
    .map((target) => {
      return `${target.id}\n  ${target.kind} ${target.title}\n  ${target.description}\n  ${target.webSocketDebuggerUrl}`;
    })
    .join("\n");
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

export function formatConsoleMessage(message: ConsoleMessage): string {
  const lines = [`#${message.id}`, `Source: ${message.source}`, `Level: ${message.level}`, `Type: ${message.type}`];

  if (message.url) {
    lines.push(`URL: ${message.url}`);
  }

  lines.push(`Text: ${message.text}`);

  if (message.stackTrace) {
    lines.push("Stack:");
    lines.push(message.stackTrace);
  }

  return lines.join("\n");
}

export function formatTraceSummary(summary: TraceRecordingSummary): string {
  const lines = [`Trace events: ${summary.eventCount}`];
  if (summary.filePath) {
    lines.push(`Saved to: ${summary.filePath}`);
  }
  return lines.join("\n");
}

export function formatMemorySummary(summary: MemorySnapshotSummary): string {
  return `Heap snapshot chunks: ${summary.chunkCount}\nSaved to: ${summary.filePath}`;
}
