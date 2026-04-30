import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

import type { DaemonInfo, IpcCommand, IpcResponse } from "./types.js";

const STATE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".agent-cdp");

function getDaemonInfoPath(): string {
  return path.join(STATE_DIR, "daemon.json");
}

function getSocketPath(): string {
  return path.join(STATE_DIR, "daemon.sock");
}

export function readDaemonInfo(): DaemonInfo | null {
  try {
    const raw = fs.readFileSync(getDaemonInfoPath(), "utf-8");
    return JSON.parse(raw) as DaemonInfo;
  } catch {
    return null;
  }
}

function isDaemonAlive(info: DaemonInfo): boolean {
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDaemon(): Promise<void> {
  const info = readDaemonInfo();
  if (info && isDaemonAlive(info)) {
    return;
  }

  try {
    fs.unlinkSync(getDaemonInfoPath());
  } catch {}

  try {
    fs.unlinkSync(getSocketPath());
  } catch {}

  const daemonScript = path.join(path.dirname(new URL(import.meta.url).pathname), "daemon.js");
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await sendCommand({ type: "ping" });
      return;
    } catch {}
  }

  throw new Error("Daemon failed to start within 5 seconds");
}

export function stopDaemon(): boolean {
  const info = readDaemonInfo();
  if (!info) {
    return false;
  }

  try {
    process.kill(info.pid, "SIGTERM");
    try {
      fs.unlinkSync(getDaemonInfoPath());
    } catch {}
    return true;
  } catch {
    return false;
  }
}

export function sendCommand(command: IpcCommand, socketTimeout = 30_000): Promise<IpcResponse> {
  return new Promise((resolve, reject) => {
    const connection = net.createConnection(getSocketPath(), () => {
      connection.write(JSON.stringify(command) + "\n");
    });

    let buffer = "";
    connection.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }
      const line = buffer.slice(0, newlineIndex);
      connection.end();
      try {
        resolve(JSON.parse(line) as IpcResponse);
      } catch {
        reject(new Error("Invalid response from daemon"));
      }
    });

    connection.on("error", (error) => {
      reject(new Error(`Cannot connect to daemon: ${error.message}`));
    });

    connection.setTimeout(socketTimeout, () => {
      connection.destroy();
      reject(new Error("Command timed out"));
    });
  });
}
