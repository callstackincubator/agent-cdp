import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { createTargetProviders } from "./providers.js";
import type { DaemonInfo, IpcCommand, IpcResponse, StatusInfo, TargetDescriptor } from "./types.js";

const STATE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".agent-cdp");

function getSocketPath(): string {
  return path.join(STATE_DIR, "daemon.sock");
}

function getDaemonInfoPath(): string {
  return path.join(STATE_DIR, "daemon.json");
}

class Daemon {
  private readonly startedAt = Date.now();
  private readonly providers = createTargetProviders();
  private readonly selectedTarget: TargetDescriptor | null = null;
  private ipcServer: net.Server | null = null;

  async start(): Promise<void> {
    fs.mkdirSync(STATE_DIR, { recursive: true });

    const socketPath = getSocketPath();
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch {}
    }

    await this.startIpc(socketPath);

    let buildMtime: number | undefined;
    try {
      buildMtime = fs.statSync(new URL(import.meta.url).pathname).mtimeMs;
    } catch {}

    const info: DaemonInfo = {
      pid: process.pid,
      socketPath,
      startedAt: this.startedAt,
      buildMtime,
    };

    fs.writeFileSync(getDaemonInfoPath(), JSON.stringify(info, null, 2));

    const shutdown = () => {
      this.stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  stop(): void {
    try {
      this.ipcServer?.close();
    } catch {}
    try {
      fs.unlinkSync(getSocketPath());
    } catch {}
    try {
      fs.unlinkSync(getDaemonInfoPath());
    } catch {}
  }

  private startIpc(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ipcServer = net.createServer((connection) => {
        let buffer = "";

        connection.on("data", (chunk) => {
          buffer += chunk.toString();
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex === -1) {
            return;
          }
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          try {
            const command = JSON.parse(line) as IpcCommand;
            void this.handleCommand(command).then((response) => {
              if (!connection.destroyed) {
                connection.write(JSON.stringify(response) + "\n");
              }
            });
          } catch {
            connection.write(
              JSON.stringify({ ok: false, error: "Invalid JSON" } satisfies IpcResponse) + "\n",
            );
          }
        });
      });

      this.ipcServer.on("error", reject);
      this.ipcServer.listen(socketPath, () => resolve());
    });
  }

  private async handleCommand(command: IpcCommand): Promise<IpcResponse> {
    if (command.type === "ping") {
      return { ok: true, data: "pong" };
    }

    const status: StatusInfo = {
      daemonRunning: true,
      uptime: Date.now() - this.startedAt,
      selectedTarget: this.selectedTarget,
      providerCount: this.providers.length,
    };

    return { ok: true, data: status };
  }
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const daemon = new Daemon();
  void daemon.start();
}

export { Daemon };
