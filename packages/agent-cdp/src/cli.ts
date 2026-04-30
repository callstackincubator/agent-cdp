import { ensureDaemon, readDaemonInfo, sendCommand, stopDaemon } from "./daemon-client.js";
import { formatStatus } from "./formatters.js";
import type { StatusInfo } from "./types.js";

export function usage(): string {
  return `Usage: agent-cdp <command>

Daemon:
  start     Start daemon
  stop      Stop daemon
  status    Show daemon status`;
}

export function parseArgs(argv: string[]): string[] {
  return argv.filter((arg) => !arg.startsWith("--"));
}

function readStatusInfo(data: unknown): StatusInfo {
  return data as StatusInfo;
}

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));
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

  console.error(usage());
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
