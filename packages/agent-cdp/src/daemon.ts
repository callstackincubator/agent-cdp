import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import {
  AgentCdpCommandDispatcher,
  getConnectionErrorMessage,
  shouldReattachConsoleCollector,
} from "./command-dispatcher.js";
import { AgentRuntimeBridge } from "./bridge/runtime-bridge.js";
import { ConsoleCollector } from "./console.js";
import { HeapSnapshotManager } from "./heap-snapshot/index.js";
import { JsAllocationProfiler } from "./js-allocation/index.js";
import { JsAllocationTimelineProfiler } from "./js-allocation-timeline/index.js";
import { JsHeapUsageMonitor } from "./js-memory/index.js";
import { JsProfiler } from "./js-profiler/index.js";
import { NetworkManager } from "./network/index.js";
import { createTargetProviders } from "./providers.js";
import { RuntimeManager } from "./runtime/index.js";
import { SessionManager } from "./session-manager.js";
import type { DaemonInfo, IpcCommand, IpcResponse } from "./types.js";
import { TraceManager } from "./trace/index.js";
import { getPackageVersion } from "./version.js";

const STATE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".agent-cdp");

function getSocketPath(): string {
  return path.join(STATE_DIR, "daemon.sock");
}

function getDaemonInfoPath(): string {
  return path.join(STATE_DIR, "daemon.json");
}

class Daemon {
  private readonly startedAt = Date.now();
  private readonly consoleCollector = new ConsoleCollector();
  private readonly networkManager = new NetworkManager();
  private readonly heapSnapshotManager = new HeapSnapshotManager();
  private readonly jsAllocationProfiler = new JsAllocationProfiler();
  private readonly jsAllocationTimelineProfiler = new JsAllocationTimelineProfiler(this.heapSnapshotManager);
  private readonly jsHeapUsageMonitor = new JsHeapUsageMonitor();
  private readonly providers = createTargetProviders();
  private readonly runtimeManager = new RuntimeManager();
  private readonly sessionManager = new SessionManager(this.providers);
  private readonly traceManager = new TraceManager();
  private readonly jsProfiler = new JsProfiler();
  private readonly commandDispatcher: AgentCdpCommandDispatcher;
  private readonly runtimeBridge: AgentRuntimeBridge;
  private ipcServer: net.Server | null = null;

  constructor() {
    this.commandDispatcher = new AgentCdpCommandDispatcher({
      startedAt: this.startedAt,
      providers: this.providers,
      sessionManager: this.sessionManager,
      consoleCollector: this.consoleCollector,
      networkManager: this.networkManager,
      heapSnapshotManager: this.heapSnapshotManager,
      jsAllocationProfiler: this.jsAllocationProfiler,
      jsAllocationTimelineProfiler: this.jsAllocationTimelineProfiler,
      jsHeapUsageMonitor: this.jsHeapUsageMonitor,
      runtimeManager: this.runtimeManager,
      traceManager: this.traceManager,
      jsProfiler: this.jsProfiler,
      beforeClearTarget: () => this.runtimeBridge.detach(),
      afterTargetSelected: (session) => this.runtimeBridge.attach(session),
      afterTargetReconnected: (session) => this.runtimeBridge.attach(session),
    });
    this.runtimeBridge = new AgentRuntimeBridge(this.commandDispatcher);
  }

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
      version: getPackageVersion(),
      buildMtime,
    };

    fs.writeFileSync(getDaemonInfoPath(), JSON.stringify(info, null, 2));

    const shutdown = () => {
      void this.sessionManager.clearTarget().finally(() => {
        this.consoleCollector.detach();
        this.networkManager.detach();
        this.runtimeBridge.detach();
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
            void this.commandDispatcher.dispatch(command).then((response) => {
              if (!connection.destroyed) {
                connection.write(JSON.stringify(response) + "\n");
              }
            });
          } catch {
            connection.write(JSON.stringify({ ok: false, error: "Invalid JSON" } satisfies IpcResponse) + "\n");
          }
        });
      });

      this.ipcServer.on("error", reject);
      this.ipcServer.listen(socketPath, () => resolve());
    });
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const daemon = new Daemon();
  void daemon.start();
}

export { Daemon, getConnectionErrorMessage, shouldReattachConsoleCollector };
