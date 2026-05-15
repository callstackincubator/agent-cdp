import type { ConsoleCollector } from "./console.js";
import type { HeapSnapshotManager } from "./heap-snapshot/index.js";
import type { JsAllocationProfiler } from "./js-allocation/index.js";
import type { JsAllocationTimelineProfiler } from "./js-allocation-timeline/index.js";
import type { JsHeapUsageMonitor } from "./js-memory/index.js";
import type { JsProfiler } from "./js-profiler/index.js";
import type { NetworkManager } from "./network/index.js";
import type { RuntimeManager } from "./runtime/index.js";
import type { SessionManager } from "./session-manager.js";
import type { RuntimeSession, IpcCommand, IpcResponse, StatusInfo, TargetProvider } from "./types.js";
import type { TraceManager } from "./trace/index.js";

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

export interface AgentCdpCommandDispatcherOptions {
  startedAt: number;
  providers: TargetProvider[];
  sessionManager: SessionManager;
  consoleCollector: ConsoleCollector;
  networkManager: NetworkManager;
  heapSnapshotManager: HeapSnapshotManager;
  jsAllocationProfiler: JsAllocationProfiler;
  jsAllocationTimelineProfiler: JsAllocationTimelineProfiler;
  jsHeapUsageMonitor: JsHeapUsageMonitor;
  runtimeManager: RuntimeManager;
  traceManager: TraceManager;
  jsProfiler: JsProfiler;
  beforeClearTarget?: () => void;
  afterTargetSelected?: (session: RuntimeSession) => Promise<void>;
  afterTargetReconnected?: (session: RuntimeSession) => Promise<void>;
}

export class AgentCdpCommandDispatcher {
  constructor(private readonly options: AgentCdpCommandDispatcherOptions) {}

  async dispatch(command: IpcCommand): Promise<IpcResponse> {
    const {
      consoleCollector,
      heapSnapshotManager,
      jsAllocationProfiler,
      jsAllocationTimelineProfiler,
      jsHeapUsageMonitor,
      jsProfiler,
      networkManager,
      providers,
      runtimeManager,
      sessionManager,
      startedAt,
      traceManager,
    } = this.options;

    try {
      if (command.type === "ping") {
        return { ok: true, data: "pong" };
      }

      if (command.type === "list-targets") {
        return { ok: true, data: await sessionManager.listTargets(command.options) };
      }

      if (command.type === "select-target") {
        const target = await sessionManager.selectTarget(command.targetId, command.options);
        const session = sessionManager.getSession();
        if (session) {
          await consoleCollector.attach(session);
          await networkManager.attach(session);
          await this.options.afterTargetSelected?.(session);
        }
        return {
          ok: true,
          data: target,
        };
      }

      if (command.type === "clear-target") {
        this.options.beforeClearTarget?.();
        consoleCollector.detach();
        networkManager.detach();
        await sessionManager.clearTarget();
        return { ok: true, data: "Target cleared" };
      }

      if (command.type === "runtime-eval") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await runtimeManager.evaluate(session, {
            expression: command.expression,
            awaitPromise: command.awaitPromise,
          }),
        };
      }

      if (command.type === "runtime-get-properties") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await runtimeManager.getProperties(session, {
            objectId: command.objectId,
            ownProperties: command.ownProperties,
            accessorPropertiesOnly: command.accessorPropertiesOnly,
          }),
        };
      }

      if (command.type === "runtime-release-object") {
        const session = await this.requireSession();
        await runtimeManager.releaseObject(session, command.objectId);
        return { ok: true, data: null };
      }

      if (command.type === "runtime-release-object-group") {
        const session = await this.requireSession();
        await runtimeManager.releaseObjectGroup(session, command.objectGroup);
        return { ok: true, data: null };
      }

      if (command.type === "network-status") {
        return { ok: true, data: networkManager.getStatus() };
      }

      if (command.type === "network-start") {
        const session = await this.requireConnectedSession();
        if (!networkManager.isAttached()) {
          await networkManager.attach(session);
        }
        return {
          ok: true,
          data: networkManager.start(command.name, command.preserveAcrossNavigation === true),
        };
      }

      if (command.type === "network-stop") {
        return { ok: true, data: await networkManager.stop() };
      }

      if (command.type === "network-list-sessions") {
        return { ok: true, data: networkManager.listSessions(command.limit, command.offset) };
      }

      if (command.type === "network-summary") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: networkManager.getSummary(command.sessionId) };
      }

      if (command.type === "network-list") {
        await this.ensureNetworkSessionReady();
        return {
          ok: true,
          data: networkManager.list({
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
        return { ok: true, data: networkManager.getRequest(command.requestId, command.sessionId) };
      }

      if (command.type === "network-request-headers") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: networkManager.getRequestHeaders(command.requestId, command.sessionId, command.name) };
      }

      if (command.type === "network-response-headers") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: networkManager.getResponseHeaders(command.requestId, command.sessionId, command.name) };
      }

      if (command.type === "network-request-body") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: await networkManager.getRequestBody(command.requestId, command.sessionId, command.filePath) };
      }

      if (command.type === "network-response-body") {
        await this.ensureNetworkSessionReady();
        return { ok: true, data: await networkManager.getResponseBody(command.requestId, command.sessionId, command.filePath) };
      }

      if (command.type === "list-console-messages") {
        await this.ensureConsoleSessionReady();
        return { ok: true, data: consoleCollector.list(command.limit) };
      }

      if (command.type === "get-console-message") {
        await this.ensureConsoleSessionReady();
        const message = consoleCollector.get(command.id);
        if (!message) {
          return { ok: false, error: `Console message ${command.id} not found` };
        }
        return { ok: true, data: message };
      }

      if (command.type === "start-trace") {
        const session = await this.requireSession();
        await traceManager.start(session);
        return { ok: true, data: "Trace started" };
      }

      if (command.type === "stop-trace") {
        return { ok: true, data: await traceManager.stop(command.filePath) };
      }

      if (command.type === "trace-status") {
        return { ok: true, data: traceManager.getStatus() };
      }

      if (command.type === "trace-list-sessions") {
        return { ok: true, data: traceManager.listSessions(command.limit, command.offset) };
      }

      if (command.type === "trace-summary") {
        return { ok: true, data: traceManager.getSummary(command.sessionId) };
      }

      if (command.type === "trace-tracks") {
        return {
          ok: true,
          data: traceManager.getTracks({
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
          data: traceManager.getEntries({
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
        return { ok: true, data: traceManager.getEntry(command.entryId, command.sessionId) };
      }

      if (command.type === "js-profile-start") {
        const session = await this.requireSession();
        await jsProfiler.start(session, command.name, command.samplingIntervalUs);
        return { ok: true, data: "JS profile started" };
      }

      if (command.type === "js-profile-stop") {
        const session = await this.requireSession();
        const sessionId = await jsProfiler.stop(session);
        return { ok: true, data: sessionId };
      }

      if (command.type === "js-profile-status") {
        return { ok: true, data: jsProfiler.getStatus() };
      }

      if (command.type === "js-profile-list-sessions") {
        return { ok: true, data: jsProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-profile-summary") {
        return { ok: true, data: jsProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-profile-hotspots") {
        return {
          ok: true,
          data: jsProfiler.getHotspots({
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
          data: jsProfiler.getHotspotDetail(command.hotspotId, command.sessionId, command.stackLimit),
        };
      }

      if (command.type === "js-profile-modules") {
        return {
          ok: true,
          data: jsProfiler.getModules({
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
          data: jsProfiler.getStacks({
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
          data: jsProfiler.getSlice(command.startMs, command.endMs, command.sessionId, command.limit),
        };
      }

      if (command.type === "js-profile-diff") {
        return {
          ok: true,
          data: jsProfiler.getDiff(
            command.baseSessionId,
            command.compareSessionId,
            command.limit,
            command.minDeltaPct,
          ),
        };
      }

      if (command.type === "js-profile-export") {
        return { ok: true, data: jsProfiler.getRawProfile(command.sessionId) };
      }

      if (command.type === "js-profile-source-maps") {
        return { ok: true, data: jsProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "js-allocation-start") {
        const session = await this.requireSession();
        await jsAllocationProfiler.start(session, {
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
        return { ok: true, data: await jsAllocationProfiler.stop(session) };
      }

      if (command.type === "js-allocation-status") {
        return { ok: true, data: jsAllocationProfiler.getStatus() };
      }

      if (command.type === "js-allocation-list-sessions") {
        return { ok: true, data: jsAllocationProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-allocation-summary") {
        return { ok: true, data: jsAllocationProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-allocation-hotspots") {
        return {
          ok: true,
          data: jsAllocationProfiler.getHotspots(command.sessionId, command.limit, command.offset, command.sortBy),
        };
      }

      if (command.type === "js-allocation-bucketed") {
        return { ok: true, data: jsAllocationProfiler.getBucketed(command.sessionId, command.limit) };
      }

      if (command.type === "js-allocation-leak-signal") {
        return { ok: true, data: jsAllocationProfiler.getLeakSignal(command.sessionId) };
      }

      if (command.type === "js-allocation-export") {
        return { ok: true, data: await jsAllocationProfiler.exportToFile(command.filePath, command.sessionId) };
      }

      if (command.type === "js-allocation-source-maps") {
        return { ok: true, data: jsAllocationProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-start") {
        const session = await this.requireSession();
        await jsAllocationTimelineProfiler.start(session, { name: command.name });
        return { ok: true, data: null };
      }

      if (command.type === "js-allocation-timeline-stop") {
        const session = await this.requireSession();
        return { ok: true, data: await jsAllocationTimelineProfiler.stop(session) };
      }

      if (command.type === "js-allocation-timeline-status") {
        return { ok: true, data: jsAllocationTimelineProfiler.getStatus() };
      }

      if (command.type === "js-allocation-timeline-list-sessions") {
        return { ok: true, data: jsAllocationTimelineProfiler.listSessions(command.limit, command.offset) };
      }

      if (command.type === "js-allocation-timeline-summary") {
        return { ok: true, data: jsAllocationTimelineProfiler.getSummary(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-buckets") {
        return { ok: true, data: jsAllocationTimelineProfiler.getBuckets(command.sessionId, command.limit) };
      }

      if (command.type === "js-allocation-timeline-hotspots") {
        return {
          ok: true,
          data: jsAllocationTimelineProfiler.getHotspots(command.sessionId, command.limit, command.offset),
        };
      }

      if (command.type === "js-allocation-timeline-leak-signal") {
        return { ok: true, data: jsAllocationTimelineProfiler.getLeakSignal(command.sessionId) };
      }

      if (command.type === "js-allocation-timeline-export") {
        return {
          ok: true,
          data: await jsAllocationTimelineProfiler.exportToFile(command.filePath, command.sessionId),
        };
      }

      if (command.type === "js-allocation-timeline-source-maps") {
        return { ok: true, data: jsAllocationTimelineProfiler.getSourceMaps(command.sessionId) };
      }

      if (command.type === "mem-snapshot-capture") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await heapSnapshotManager.capture(session, {
            name: command.name,
            collectGarbage: command.collectGarbage,
            filePath: command.filePath,
          }),
        };
      }

      if (command.type === "mem-snapshot-load") {
        return { ok: true, data: await heapSnapshotManager.load(command.filePath, command.name) };
      }

      if (command.type === "mem-snapshot-list") {
        return { ok: true, data: heapSnapshotManager.list() };
      }

      if (command.type === "mem-snapshot-summary") {
        return { ok: true, data: heapSnapshotManager.getSummary(command.snapshotId) };
      }

      if (command.type === "mem-snapshot-classes") {
        const sortBy = command.sortBy === "selfSize" || command.sortBy === "count" ? command.sortBy : "retainedSize";
        return {
          ok: true,
          data: heapSnapshotManager.getClasses(command.snapshotId, {
            sortBy,
            limit: command.limit,
            offset: command.offset,
            filter: command.filter,
          }),
        };
      }

      if (command.type === "mem-snapshot-class") {
        return { ok: true, data: heapSnapshotManager.getClass(command.classId, command.snapshotId) };
      }

      if (command.type === "mem-snapshot-instances") {
        const sortBy = command.sortBy === "selfSize" ? "selfSize" : "retainedSize";
        return {
          ok: true,
          data: heapSnapshotManager.getInstances(command.classId, command.snapshotId, {
            limit: command.limit,
            offset: command.offset,
            sortBy,
          }),
        };
      }

      if (command.type === "mem-snapshot-instance") {
        return { ok: true, data: heapSnapshotManager.getInstance(command.nodeId, command.snapshotId) };
      }

      if (command.type === "mem-snapshot-retainers") {
        return {
          ok: true,
          data: heapSnapshotManager.getRetainers(command.nodeId, command.snapshotId, command.depth, command.limit),
        };
      }

      if (command.type === "mem-snapshot-diff") {
        const sortBy = command.sortBy === "selfDelta" || command.sortBy === "countDelta" ? command.sortBy : "retainedDelta";
        return {
          ok: true,
          data: heapSnapshotManager.getDiff(command.baseSnapshotId, command.compareSnapshotId, {
            sortBy,
            limit: command.limit,
          }),
        };
      }

      if (command.type === "mem-snapshot-leak-triplet") {
        return {
          ok: true,
          data: heapSnapshotManager.getLeakTriplet(
            command.baselineSnapshotId,
            command.actionSnapshotId,
            command.cleanupSnapshotId,
            command.limit,
          ),
        };
      }

      if (command.type === "mem-snapshot-leak-candidates") {
        return { ok: true, data: heapSnapshotManager.getLeakCandidates(command.snapshotId, command.limit) };
      }

      if (command.type === "js-memory-sample") {
        const session = await this.requireSession();
        return {
          ok: true,
          data: await jsHeapUsageMonitor.sample(session, {
            label: command.label,
            collectGarbage: command.collectGarbage,
          }),
        };
      }

      if (command.type === "js-memory-list") {
        return { ok: true, data: jsHeapUsageMonitor.list(command.limit, command.offset) };
      }

      if (command.type === "js-memory-summary") {
        return { ok: true, data: jsHeapUsageMonitor.getSummary() };
      }

      if (command.type === "js-memory-diff") {
        return {
          ok: true,
          data: jsHeapUsageMonitor.getDiff(command.baseSampleId, command.compareSampleId),
        };
      }

      if (command.type === "js-memory-trend") {
        return { ok: true, data: jsHeapUsageMonitor.getTrend(command.limit) };
      }

      if (command.type === "js-memory-leak-signal") {
        return { ok: true, data: jsHeapUsageMonitor.getLeakSignal(command.sinceSampleId) };
      }

      const status: StatusInfo = {
        daemonRunning: true,
        uptime: Date.now() - startedAt,
        selectedTarget: sessionManager.getSelectedTarget(),
        providerCount: providers.length,
        sessionState: sessionManager.getSessionState(),
        tracingActive: traceManager.isActive(),
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
    const { consoleCollector } = this.options;
    const currentSession = this.options.sessionManager.getSession();
    const wasConnected = currentSession?.transport.isConnected() || false;
    const session = await this.requireConnectedSession();
    const target = session.target;
    if (!shouldReattachConsoleCollector(wasConnected, target)) {
      return;
    }

    await consoleCollector.attach(session);
  }

  private async ensureNetworkSessionReady(): Promise<void> {
    const { networkManager } = this.options;
    const currentSession = this.options.sessionManager.getSession();
    const wasConnected = currentSession?.transport.isConnected() || false;
    const session = await this.requireConnectedSession();
    if (wasConnected && networkManager.isAttached()) {
      return;
    }
    await networkManager.attach(session);
  }

  private async requireConnectedSession() {
    const { sessionManager } = this.options;
    const selectedTarget = sessionManager.getSelectedTarget();
    const previousSession = sessionManager.getSession();
    const wasConnected = previousSession?.transport.isConnected() || false;
    await sessionManager.reconnectSelectedTarget();
    const session = sessionManager.getSession();
    if (!session || !session.transport.isConnected()) {
      throw new Error(getConnectionErrorMessage(selectedTarget));
    }
    if (!wasConnected || session !== previousSession) {
      await this.options.afterTargetReconnected?.(session);
    }
    return session;
  }

  private requireSession() {
    return this.requireConnectedSession();
  }
}
