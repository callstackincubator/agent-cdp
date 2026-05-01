import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { ConsoleCollector } from "./console.js";
import { JsProfiler } from "./js-profiler/index.js";
import { MemorySnapshotter } from "./memory.js";
import { createTargetProviders } from "./providers.js";
import { SessionManager } from "./session-manager.js";
import { TraceRecorder } from "./trace.js";
import type { DaemonInfo, IpcCommand, IpcResponse, StatusInfo } from "./types.js";

const STATE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".agent-cdp");

function getSocketPath(): string {
  return path.join(STATE_DIR, "daemon.sock");
}

function getDaemonInfoPath(): string {
  return path.join(STATE_DIR, "daemon.json");
}

export function shouldReattachConsoleCollector(
  wasConnected: boolean,
  target: { kind: "chrome" | "react-native" } | null,
): boolean {
  return !wasConnected && target?.kind === "react-native";
}

export function getConnectionErrorMessage(selectedTarget: { id: string } | null): string {
  if (!selectedTarget) {
    return "No target selected. Use `target select` first.";
  }

  return `Target ${selectedTarget.id} is not connected. Reconnect the app and try again.`;
}

class Daemon {
  private readonly startedAt = Date.now();
  private readonly consoleCollector = new ConsoleCollector();
  private readonly memorySnapshotter = new MemorySnapshotter();
  private readonly providers = createTargetProviders();
  private readonly sessionManager = new SessionManager(this.providers);
  private readonly traceRecorder = new TraceRecorder();
  private readonly jsProfiler = new JsProfiler();
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
      void this.sessionManager.clearTarget().finally(() => {
        this.consoleCollector.detach();
        this.stop();
        process.exit(0);
      });
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
    try {
      if (command.type === "ping") {
        return { ok: true, data: "pong" };
      }

      if (command.type === "list-targets") {
        return { ok: true, data: await this.sessionManager.listTargets(command.options) };
      }

      if (command.type === "select-target") {
        const target = await this.sessionManager.selectTarget(command.targetId, command.options);
        const session = this.sessionManager.getSession();
        if (session) {
          await this.consoleCollector.attach(session);
        }
        return {
          ok: true,
          data: target,
        };
      }

      if (command.type === "clear-target") {
        this.consoleCollector.detach();
        await this.sessionManager.clearTarget();
        return { ok: true, data: "Target cleared" };
      }

      if (command.type === "list-console-messages") {
        await this.ensureConsoleSessionReady();
        return { ok: true, data: this.consoleCollector.list(command.limit) };
      }

      if (command.type === "get-console-message") {
        await this.ensureConsoleSessionReady();
        const message = this.consoleCollector.get(command.id);
        if (!message) {
          return { ok: false, error: `Console message ${command.id} not found` };
        }
        return { ok: true, data: message };
      }

      if (command.type === "start-trace") {
        const session = await this.requireSession();
        await this.traceRecorder.start(session);
        return { ok: true, data: "Trace started" };
      }

      if (command.type === "stop-trace") {
        return { ok: true, data: await this.traceRecorder.stop(command.filePath) };
      }

      if (command.type === "capture-memory") {
        const session = await this.requireSession();
        return { ok: true, data: await this.memorySnapshotter.capture(session, command.filePath) };
      }

      if (command.type === "js-profile-start") {
        const session = await this.requireSession();
        await this.jsProfiler.start(session, command.name, command.samplingIntervalUs);
        return { ok: true, data: "JS profile started" };
      }

      if (command.type === "js-profile-stop") {
        const session = await this.requireSession();
        const sessionId = await this.jsProfiler.stop(session);
        return { ok: true, data: sessionId };
      }

      if (command.type === "js-profile-status") {
        return { ok: true, data: this.jsProfiler.getStatus() };
      }

      if (command.type === "js-profile-list-sessions") {
        return { ok: true, data: this.jsProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-profile-summary") {
        return { ok: true, data: this.jsProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-profile-hotspots") {
        return {
          ok: true,
          data: this.jsProfiler.getHotspots({
            sessionId: command.sessionId,
            limit: command.limit,
            offset: command.offset,
            sortBy: command.sortBy,
            minSelfMs: command.minSelfMs,
            includeRuntime: command.includeRuntime,
          }),
        };
      }

      if (command.type === "js-profile-hotspot") {
        return {
          ok: true,
          data: this.jsProfiler.getHotspotDetail(command.hotspotId, command.sessionId, command.stackLimit),
        };
      }

      if (command.type === "js-profile-modules") {
        return {
          ok: true,
          data: this.jsProfiler.getModules({
            sessionId: command.sessionId,
            limit: command.limit,
            offset: command.offset,
            sortBy: command.sortBy,
          }),
        };
      }

      if (command.type === "js-profile-stacks") {
        return {
          ok: true,
          data: this.jsProfiler.getStacks({
            sessionId: command.sessionId,
            limit: command.limit,
            offset: command.offset,
            minMs: command.minMs,
            maxDepth: command.maxDepth,
          }),
        };
      }

      if (command.type === "js-profile-slice") {
        return {
          ok: true,
          data: this.jsProfiler.getSlice(command.startMs, command.endMs, command.sessionId, command.limit),
        };
      }

      if (command.type === "js-profile-diff") {
        return {
          ok: true,
          data: this.jsProfiler.getDiff(
            command.baseSessionId,
            command.compareSessionId,
            command.limit,
            command.minDeltaPct,
          ),
        };
      }

      if (command.type === "js-profile-export") {
        return { ok: true, data: this.jsProfiler.getRawProfile(command.sessionId) };
      }

      const status: StatusInfo = {
        daemonRunning: true,
        uptime: Date.now() - this.startedAt,
        selectedTarget: this.sessionManager.getSelectedTarget(),
        providerCount: this.providers.length,
        sessionState: this.sessionManager.getSessionState(),
        tracingActive: this.traceRecorder.isActive(),
      };

      return { ok: true, data: status };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureConsoleSessionReady(): Promise<void> {
    const currentSession = this.sessionManager.getSession();
    const wasConnected = currentSession?.transport.isConnected() || false;
    const session = await this.requireConnectedSession();
    const target = session.target;
    if (!shouldReattachConsoleCollector(wasConnected, target)) {
      return;
    }

    await this.consoleCollector.attach(session);
  }

  private async requireConnectedSession() {
    const selectedTarget = this.sessionManager.getSelectedTarget();
    await this.sessionManager.reconnectSelectedTarget();
    const session = this.sessionManager.getSession();
    if (!session || !session.transport.isConnected()) {
      throw new Error(getConnectionErrorMessage(selectedTarget));
    }
    return session;
  }

  private requireSession() {
    return this.requireConnectedSession();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const daemon = new Daemon();
  void daemon.start();
}

export { Daemon };
