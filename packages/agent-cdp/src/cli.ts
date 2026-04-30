import { ensureDaemon, readDaemonInfo, sendCommand, stopDaemon } from "./daemon-client.js";
import {
  formatConsoleList,
  formatConsoleMessage,
  formatMemorySummary,
  formatStatus,
  formatTargetList,
  formatTraceSummary,
} from "./formatters.js";
import type {
  ConsoleMessage,
  DiscoveryOptions,
  MemorySnapshotSummary,
  StatusInfo,
  TargetDescriptor,
  TraceRecordingSummary,
} from "./types.js";

export function usage(): string {
  return `Usage: agent-cdp <command>

Daemon:
  start     Start daemon
  stop      Stop daemon
  status    Show daemon status

Targets:
  target list [--chrome-url URL] [--react-native-url URL]
  target select <id> [--chrome-url URL] [--react-native-url URL]
  target clear

Console:
  console list [--limit N]
  console get <id>

Trace:
  trace start
  trace stop [--file PATH]

Memory:
  memory capture --file PATH`;
}

export function parseArgs(argv: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      command.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
      continue;
    }

    flags[key] = true;
  }

  return { command, flags };
}

function readStatusInfo(data: unknown): StatusInfo {
  return data as StatusInfo;
}

function readTargets(data: unknown): TargetDescriptor[] {
  return data as TargetDescriptor[];
}

function readConsoleMessages(data: unknown): ConsoleMessage[] {
  return data as ConsoleMessage[];
}

function readConsoleMessage(data: unknown): ConsoleMessage {
  return data as ConsoleMessage;
}

function readTraceSummary(data: unknown): TraceRecordingSummary {
  return data as TraceRecordingSummary;
}

function readMemorySummary(data: unknown): MemorySnapshotSummary {
  return data as MemorySnapshotSummary;
}

function discoveryOptionsFromFlags(flags: Record<string, string | boolean>): DiscoveryOptions {
  return {
    chromeUrl: typeof flags["chrome-url"] === "string" ? flags["chrome-url"] : undefined,
    reactNativeUrl: typeof flags["react-native-url"] === "string" ? flags["react-native-url"] : undefined,
  };
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cmd = command[0];

  if (!cmd || cmd === "help") {
    console.log(usage());
    return;
  }

  if (cmd === "start") {
    await ensureDaemon();
    const response = await sendCommand({ type: "status" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to load daemon status");
    }
    console.log(formatStatus(readStatusInfo(response.data)));
    return;
  }

  if (cmd === "stop") {
    console.log(stopDaemon() ? "Daemon stopped" : "Daemon is not running");
    return;
  }

  if (cmd === "status") {
    const info = readDaemonInfo();
    if (!info) {
      console.log("Daemon is not running");
      process.exit(1);
    }

    const response = await sendCommand({ type: "status" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to load daemon status");
    }
    console.log(formatStatus(readStatusInfo(response.data)));
    return;
  }

  if (cmd === "target" && command[1] === "list") {
    await ensureDaemon();
    const response = await sendCommand({
      type: "list-targets",
      options: discoveryOptionsFromFlags(flags),
    });
    if (!response.ok) {
      throw new Error(response.error || "Failed to list targets");
    }
    console.log(formatTargetList(readTargets(response.data)));
    return;
  }

  if (cmd === "target" && command[1] === "select") {
    const targetId = command[2];
    if (!targetId) {
      throw new Error("Usage: agent-cdp target select <id> [--chrome-url URL] [--react-native-url URL]");
    }
    await ensureDaemon();
    const response = await sendCommand({
      type: "select-target",
      targetId,
      options: discoveryOptionsFromFlags(flags),
    });
    if (!response.ok) {
      throw new Error(response.error || "Failed to select target");
    }
    console.log(`Selected target: ${targetId}`);
    return;
  }

  if (cmd === "target" && command[1] === "clear") {
    await ensureDaemon();
    const response = await sendCommand({ type: "clear-target" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to clear target");
    }
    console.log("Target cleared");
    return;
  }

  if (cmd === "console" && command[1] === "list") {
    await ensureDaemon();
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const response = await sendCommand({ type: "list-console-messages", limit });
    if (!response.ok) {
      throw new Error(response.error || "Failed to list console messages");
    }
    console.log(formatConsoleList(readConsoleMessages(response.data)));
    return;
  }

  if (cmd === "console" && command[1] === "get") {
    const rawId = command[2];
    const id = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (Number.isNaN(id)) {
      throw new Error("Usage: agent-cdp console get <id>");
    }
    await ensureDaemon();
    const response = await sendCommand({ type: "get-console-message", id });
    if (!response.ok) {
      throw new Error(response.error || "Failed to get console message");
    }
    console.log(formatConsoleMessage(readConsoleMessage(response.data)));
    return;
  }

  if (cmd === "trace" && command[1] === "start") {
    await ensureDaemon();
    const response = await sendCommand({ type: "start-trace" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to start trace");
    }
    console.log("Trace started");
    return;
  }

  if (cmd === "trace" && command[1] === "stop") {
    await ensureDaemon();
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    const response = await sendCommand({ type: "stop-trace", filePath });
    if (!response.ok) {
      throw new Error(response.error || "Failed to stop trace");
    }
    console.log(formatTraceSummary(readTraceSummary(response.data)));
    return;
  }

  if (cmd === "memory" && command[1] === "capture") {
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    if (!filePath) {
      throw new Error("Usage: agent-cdp memory capture --file PATH");
    }
    await ensureDaemon();
    const response = await sendCommand({ type: "capture-memory", filePath });
    if (!response.ok) {
      throw new Error(response.error || "Failed to capture heap snapshot");
    }
    console.log(formatMemorySummary(readMemorySummary(response.data)));
    return;
  }

  console.error(usage());
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
