import fs from "node:fs";
import net from "node:net";
import path from "node:path";

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
import { TraceManager } from "./trace/index.js";
import type { DaemonInfo, IpcCommand, IpcResponse, StatusInfo } from "./types.js";
import { getPackageVersion } from "./version.js";

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
    return "No target available. Use `target list` to find one, then `target select <id>`.";
  }

  return `Target ${selectedTarget.id} is not connected. Reconnect the app and try again.`;
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
      version: getPackageVersion(),
      buildMtime,
    };

    fs.writeFileSync(getDaemonInfoPath(), JSON.stringify(info, null, 2));

    const shutdown = () => {
      void this.sessionManager.clearTarget().finally(() => {
        this.consoleCollector.detach();
        this.networkManager.detach();
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
          await this.networkManager.attach(session);
        }
        return {
          ok: true,
          data: target,
        };
      }

      if (command.type === "clear-target") {
        this.consoleCollector.detach();
        this.networkManager.detach();
        await this.sessionManager.clearTarget();
        return { ok: true, data: "Target cleared" };
      }

      if (command.type === "runtime-eval") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await this.runtimeManager.evaluate(session, {
            expression: command.expression,
            awaitPromise: command.awaitPromise,
          }),
        };
      }

      if (command.type === "runtime-get-properties") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await this.runtimeManager.getProperties(session, {
            objectId: command.objectId,
            ownProperties: command.ownProperties,
            accessorPropertiesOnly: command.accessorPropertiesOnly,
          }),
        };
      }

      if (command.type === "runtime-release-object") {
        const session = await this.requireSession();
        await this.runtimeManager.releaseObject(session, command.objectId);
        return { ok: true, data: null };
      }

      if (command.type === "runtime-release-object-group") {
        const session = await this.requireSession();
        await this.runtimeManager.releaseObjectGroup(session, command.objectGroup);
        return { ok: true, data: null };
      }

      if (command.type === "network-status") {
        return { ok: true, data: this.networkManager.getStatus() };
      }

      if (command.type === "network-start") {
        const session = await this.requireConnectedSession();
        if (!this.networkManager.isAttached()) {
          await this.networkManager.attach(session);
        }
        return {
          ok: true,
          data: this.networkManager.start(command.name, command.preserveAcrossNavigation === true),
        };
      }

      if (command.type === "network-stop") {
        return { ok: true, data: await this.networkManager.stop() };
      }

      if (command.type === "network-list-sessions") {
        return { ok: true, data: this.networkManager.listSessions(command.limit, command.offset) };
      }

      if (command.type === "network-summary") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: this.networkManager.getSummary(command.sessionId) };
      }

      if (command.type === "network-list") {
        await this.ensureNetworkSessionReady();
        return {
          ok: true,
          data: this.networkManager.list({
            sessionId: command.sessionId,
            limit: command.limit,
            offset: command.offset,
            type: command.resourceType,
            status: command.status,
            method: command.method,
            text: command.text,
            minMs: command.minMs,
            maxMs: command.maxMs,
            minBytes: command.minBytes,
            maxBytes: command.maxBytes,
          }),
        };
      }

      if (command.type === "network-request") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: this.networkManager.getRequest(command.requestId, command.sessionId) };
      }

      if (command.type === "network-request-headers") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: this.networkManager.getRequestHeaders(command.requestId, command.sessionId, command.name) };
      }

      if (command.type === "network-response-headers") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: this.networkManager.getResponseHeaders(command.requestId, command.sessionId, command.name) };
      }

      if (command.type === "network-request-body") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: await this.networkManager.getRequestBody(command.requestId, command.sessionId, command.filePath) };
      }

      if (command.type === "network-response-body") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: await this.networkManager.getResponseBody(command.requestId, command.sessionId, command.filePath) };
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
        await this.traceManager.start(session);
        return { ok: true, data: "Trace started" };
      }

      if (command.type === "stop-trace") {
        return { ok: true, data: await this.traceManager.stop(command.filePath) };
      }

      if (command.type === "trace-status") {
        return { ok: true, data: this.traceManager.getStatus() };
      }

      if (command.type === "trace-list-sessions") {
        return { ok: true, data: this.traceManager.listSessions(command.limit, command.offset) };
      }

      if (command.type === "trace-summary") {
        return { ok: true, data: this.traceManager.getSummary(command.sessionId) };
      }

      if (command.type === "trace-tracks") {
        return {
          ok: true,
          data: this.traceManager.getTracks({
            sessionId: command.sessionId,
            limit: command.limit,
            offset: command.offset,
            text: command.text,
            group: command.group,
          }),
        };
      }

      if (command.type === "trace-entries") {
        return {
          ok: true,
          data: this.traceManager.getEntries({
            sessionId: command.sessionId,
            track: command.track,
            type: command.typeFilter,
            text: command.text,
            startMs: command.startMs,
            endMs: command.endMs,
            limit: command.limit,
            offset: command.offset,
            sortBy: command.sortBy,
          }),
        };
      }

      if (command.type === "trace-entry") {
        return { ok: true, data: this.traceManager.getEntry(command.entryId, command.sessionId) };
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
            minTotalMs: command.minTotalMs,
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

      if (command.type === "js-profile-source-maps") {
        return { ok: true, data: this.jsProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "js-allocation-start") {
        const session = await this.requireSession();
        await this.jsAllocationProfiler.start(session, {
          name: command.name,
          samplingIntervalBytes: command.samplingIntervalBytes,
          stackDepth: command.stackDepth,
          includeObjectsCollectedByMajorGC: command.includeObjectsCollectedByMajorGC,
          includeObjectsCollectedByMinorGC: command.includeObjectsCollectedByMinorGC,
        });
        return { ok: true, data: null };
      }

      if (command.type === "js-allocation-stop") {
        const session = await this.requireSession();
        return { ok: true, data: await this.jsAllocationProfiler.stop(session) };
      }

      if (command.type === "js-allocation-status") {
        return { ok: true, data: this.jsAllocationProfiler.getStatus() };
      }

      if (command.type === "js-allocation-list-sessions") {
        return { ok: true, data: this.jsAllocationProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-allocation-summary") {
        return { ok: true, data: this.jsAllocationProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-allocation-hotspots") {
        return {
          ok: true,
          data: this.jsAllocationProfiler.getHotspots(command.sessionId, command.limit, command.offset, command.sortBy),
        };
      }

      if (command.type === "js-allocation-bucketed") {
        return { ok: true, data: this.jsAllocationProfiler.getBucketed(command.sessionId, command.limit) };
      }

      if (command.type === "js-allocation-leak-signal") {
        return { ok: true, data: this.jsAllocationProfiler.getLeakSignal(command.sessionId) };
      }

      if (command.type === "js-allocation-export") {
        return { ok: true, data: await this.jsAllocationProfiler.exportToFile(command.filePath, command.sessionId) };
      }

      if (command.type === "js-allocation-source-maps") {
        return { ok: true, data: this.jsAllocationProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-start") {
        const session = await this.requireSession();
        await this.jsAllocationTimelineProfiler.start(session, { name: command.name });
        return { ok: true, data: null };
      }

      if (command.type === "js-allocation-timeline-stop") {
        const session = await this.requireSession();
        return { ok: true, data: await this.jsAllocationTimelineProfiler.stop(session) };
      }

      if (command.type === "js-allocation-timeline-status") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.getStatus() };
      }

      if (command.type === "js-allocation-timeline-list-sessions") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-allocation-timeline-summary") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-buckets") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.getBuckets(command.sessionId, command.limit) };
      }

      if (command.type === "js-allocation-timeline-hotspots") {
        return {
          ok: true,
          data: this.jsAllocationTimelineProfiler.getHotspots(command.sessionId, command.limit, command.offset),
        };
      }

      if (command.type === "js-allocation-timeline-leak-signal") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.getLeakSignal(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-export") {
        return {
          ok: true,
          data: await this.jsAllocationTimelineProfiler.exportToFile(command.filePath, command.sessionId),
        };
      }

      if (command.type === "js-allocation-timeline-source-maps") {
        return { ok: true, data: this.jsAllocationTimelineProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "mem-snapshot-capture") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await this.heapSnapshotManager.capture(session, {
            name: command.name,
            collectGarbage: command.collectGarbage,
            filePath: command.filePath,
          }),
        };
      }

      if (command.type === "mem-snapshot-load") {
        return { ok: true, data: await this.heapSnapshotManager.load(command.filePath, command.name) };
      }

      if (command.type === "mem-snapshot-list") {
        return { ok: true, data: this.heapSnapshotManager.list() };
      }

      if (command.type === "mem-snapshot-summary") {
        return { ok: true, data: this.heapSnapshotManager.getSummary(command.snapshotId) };
      }

      if (command.type === "mem-snapshot-classes") {
        const sortBy =
          command.sortBy === "selfSize" || command.sortBy === "count" ? command.sortBy : "retainedSize";
        return {
          ok: true,
          data: this.heapSnapshotManager.getClasses(command.snapshotId, {
            sortBy,
            limit: command.limit,
            offset: command.offset,
            filter: command.filter,
          }),
        };
      }

      if (command.type === "mem-snapshot-class") {
        return { ok: true, data: this.heapSnapshotManager.getClass(command.classId, command.snapshotId) };
      }

      if (command.type === "mem-snapshot-instances") {
        const sortBy = command.sortBy === "selfSize" ? "selfSize" : "retainedSize";
        return {
          ok: true,
          data: this.heapSnapshotManager.getInstances(command.classId, command.snapshotId, {
            limit: command.limit,
            offset: command.offset,
            sortBy,
          }),
        };
      }

      if (command.type === "mem-snapshot-instance") {
        return { ok: true, data: this.heapSnapshotManager.getInstance(command.nodeId, command.snapshotId) };
      }

      if (command.type === "mem-snapshot-retainers") {
        return {
          ok: true,
          data: this.heapSnapshotManager.getRetainers(
            command.nodeId,
            command.snapshotId,
            command.depth,
            command.limit,
          ),
        };
      }

      if (command.type === "mem-snapshot-diff") {
        const sortBy =
          command.sortBy === "selfDelta" || command.sortBy === "countDelta" ? command.sortBy : "retainedDelta";
        return {
          ok: true,
          data: this.heapSnapshotManager.getDiff(command.baseSnapshotId, command.compareSnapshotId, {
            sortBy,
            limit: command.limit,
          }),
        };
      }

      if (command.type === "mem-snapshot-leak-triplet") {
        return {
          ok: true,
          data: this.heapSnapshotManager.getLeakTriplet(
            command.baselineSnapshotId,
            command.actionSnapshotId,
            command.cleanupSnapshotId,
            command.limit,
          ),
        };
      }

      if (command.type === "mem-snapshot-leak-candidates") {
        return {
          ok: true,
          data: this.heapSnapshotManager.getLeakCandidates(command.snapshotId, command.limit),
        };
      }

      if (command.type === "js-memory-sample") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await this.jsHeapUsageMonitor.sample(session, {
            label: command.label,
            collectGarbage: command.collectGarbage,
          }),
        };
      }

      if (command.type === "js-memory-list") {
        return { ok: true, data: this.jsHeapUsageMonitor.list(command.limit, command.offset) };
      }

      if (command.type === "js-memory-summary") {
        return { ok: true, data: this.jsHeapUsageMonitor.getSummary() };
      }

      if (command.type === "js-memory-diff") {
        return {
          ok: true,
          data: this.jsHeapUsageMonitor.getDiff(command.baseSampleId, command.compareSampleId),
        };
      }

      if (command.type === "js-memory-trend") {
        return { ok: true, data: this.jsHeapUsageMonitor.getTrend(command.limit) };
      }

      if (command.type === "js-memory-leak-signal") {
        return { ok: true, data: this.jsHeapUsageMonitor.getLeakSignal() };
      }

      const status: StatusInfo = {
        daemonRunning: true,
        uptime: Date.now() - this.startedAt,
        selectedTarget: this.sessionManager.getSelectedTarget(),
        providerCount: this.providers.length,
        sessionState: this.sessionManager.getSessionState(),
        tracingActive: this.traceManager.isActive(),
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

  private async ensureNetworkSessionReady(): Promise<void> {
    const currentSession = this.sessionManager.getSession();
    const wasConnected = currentSession?.transport.isConnected() || false;
    const session = await this.requireConnectedSession();
    if (wasConnected && this.networkManager.isAttached()) {
      return;
    }
    await this.networkManager.attach(session);
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
