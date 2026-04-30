import { ensureDaemon, readDaemonInfo, sendCommand, stopDaemon } from "./daemon-client.js";
import { formatStatus, formatTargetList } from "./formatters.js";
import type { DiscoveryOptions, StatusInfo, TargetDescriptor } from "./types.js";

export function usage(): string {
  return `Usage: agent-cdp <command>

Daemon:
  start     Start daemon
  stop      Stop daemon
  status    Show daemon status

Targets:
  target list [--chrome-url URL] [--react-native-url URL]
  target select <id> [--chrome-url URL] [--react-native-url URL]
  target clear`;
}

export function parseArgs(argv: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

  console.error(usage());
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
