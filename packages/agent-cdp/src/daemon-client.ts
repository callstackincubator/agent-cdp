import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

import type { DaemonInfo, IpcCommand, IpcResponse } from "./types.js";
import { getPackageVersion } from "./version.js";

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

export function getRequiredDaemonAction(
  info: DaemonInfo | null,
  currentVersion: string,
  daemonAlive = info ? isDaemonAlive(info) : false,
): "reuse" | "restart" | "start" {
  if (!info || !daemonAlive) {
    return "start";
  }

  if (info.version !== currentVersion) {
    return "restart";
  }

  return "reuse";
}

function cleanupDaemonState(): void {
  try {
    fs.unlinkSync(getDaemonInfoPath());
  } catch {}

  try {
    fs.unlinkSync(getSocketPath());
  } catch {}
}

async function waitForDaemonExit(pid: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return;
    }
  }

  throw new Error("Daemon failed to stop within 5 seconds");
}

async function stopDaemonProcess(info: DaemonInfo): Promise<void> {
  process.kill(info.pid, "SIGTERM");
  await waitForDaemonExit(info.pid);
  cleanupDaemonState();
}

async function startDaemon(): Promise<void> {
  cleanupDaemonState();

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

export async function ensureDaemon(): Promise<void> {
  const info = readDaemonInfo();
  const action = getRequiredDaemonAction(info, getPackageVersion());
  if (action === "reuse") {
    return;
  }

  if (action === "restart" && info) {
    await stopDaemonProcess(info);
  } else {
    cleanupDaemonState();
  }

  await startDaemon();
}

export async function stopDaemon(): Promise<boolean> {
  const info = readDaemonInfo();
  if (!info) {
    return false;
  }

  try {
    await stopDaemonProcess(info);
    return true;
  } catch {
    cleanupDaemonState();
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
