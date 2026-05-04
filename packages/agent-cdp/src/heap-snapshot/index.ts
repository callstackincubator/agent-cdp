import fs from "node:fs/promises";
import path from "node:path";

import type { CdpEventMessage, RuntimeSession } from "../types.js";
import { analyzeSnapshot } from "./analyze.js";
import { parseHeapSnapshot } from "./parser.js";
import {
  type ClassesOptions,
  type DiffOptions,
  type InstancesOptions,
  queryClass,
  queryClasses,
  queryDiff,
  queryInstance,
  queryInstances,
  queryLeakCandidates,
  queryLeakTriplet,
  queryRetainers,
  querySnapshotMeta,
  querySnapshotSummary,
} from "./query.js";
import { HeapSnapshotStore } from "./store.js";
import type {
  AnalyzedSnapshot,
  MemLeakCandidatesResult,
  MemLeakTripletResult,
  MemSnapshotClassResult,
  MemSnapshotClassesResult,
  MemSnapshotDiffResult,
  MemSnapshotInstanceResult,
  MemSnapshotInstancesResult,
  MemSnapshotMeta,
  MemSnapshotRetainersResult,
  MemSnapshotSummaryResult,
  RawHeapSnapshotJson,
} from "./types.js";

interface ActiveCapture {
  chunks: string[];
  resolveCompletion: () => void;
  completion: Promise<void>;
}

export class HeapSnapshotManager {
  private readonly store = new HeapSnapshotStore();

  async capture(
    session: RuntimeSession,
    opts: { name?: string; collectGarbage?: boolean; filePath?: string } = {},
  ): Promise<MemSnapshotMeta> {
    if (opts.collectGarbage) {
      await session.transport.send("HeapProfiler.collectGarbage");
    }

    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    const capture: ActiveCapture = { chunks: [], resolveCompletion, completion };

    const unsubscribe = session.transport.onEvent((msg: CdpEventMessage) => {
      if (msg.method === "HeapProfiler.addHeapSnapshotChunk") {
        const chunk = typeof msg.params?.chunk === "string" ? msg.params.chunk : "";
        capture.chunks.push(chunk);
        return;
      }
      if (msg.method === "HeapProfiler.reportHeapSnapshotProgress" && msg.params?.finished === true) {
        capture.resolveCompletion();
      }
    });

    try {
      await session.transport.send("HeapProfiler.takeHeapSnapshot", { reportProgress: true });
      await capture.completion;
    } finally {
      unsubscribe();
    }

    const rawJson = capture.chunks.join("");
    const raw = JSON.parse(rawJson) as RawHeapSnapshotJson;

    if (opts.filePath) {
      await fs.writeFile(path.resolve(opts.filePath), rawJson);
    }

    const analyzed = this.ingestRawSnapshot(raw, {
      name: opts.name ?? `snapshot-${Date.now()}`,
      filePath: opts.filePath ? path.resolve(opts.filePath) : "",
      capturedAt: Date.now(),
      collectGarbageRequested: opts.collectGarbage ?? false,
    });
    return querySnapshotMeta(analyzed);
  }

  async load(filePath: string, name?: string): Promise<MemSnapshotMeta> {
    const absPath = path.resolve(filePath);
    const rawJson = await fs.readFile(absPath, "utf8");
    const raw = JSON.parse(rawJson) as RawHeapSnapshotJson;

    const analyzed = this.ingestRawSnapshot(raw, {
      name: name ?? path.basename(filePath, ".heapsnapshot"),
      filePath: absPath,
      capturedAt: Date.now(),
      collectGarbageRequested: false,
    });
    return querySnapshotMeta(analyzed);
  }

  ingestRawSnapshot(
    raw: RawHeapSnapshotJson,
    meta: { name: string; filePath: string; capturedAt: number; collectGarbageRequested: boolean },
  ): AnalyzedSnapshot {
    const snapshotId = this.store.generateId();
    const parsed = parseHeapSnapshot(raw);
    const analyzed = analyzeSnapshot(parsed, { snapshotId, ...meta });
    this.store.add(analyzed);
    return analyzed;
  }

  list(): MemSnapshotMeta[] {
    return this.store.list().map(querySnapshotMeta);
  }

  count(): number {
    return this.store.count();
  }

  getSummary(snapshotId?: string): MemSnapshotSummaryResult {
    return querySnapshotSummary(this.resolveSnapshot(snapshotId));
  }

  getClasses(snapshotId?: string, opts: ClassesOptions = {}): MemSnapshotClassesResult {
    return queryClasses(this.resolveSnapshot(snapshotId), opts);
  }

  getClass(classId: string, snapshotId?: string): MemSnapshotClassResult {
    return queryClass(this.resolveSnapshot(snapshotId), classId);
  }

  getInstances(classId: string, snapshotId?: string, opts: InstancesOptions = {}): MemSnapshotInstancesResult {
    return queryInstances(this.resolveSnapshot(snapshotId), classId, opts);
  }

  getInstance(nodeId: number, snapshotId?: string): MemSnapshotInstanceResult {
    return queryInstance(this.resolveSnapshot(snapshotId), nodeId);
  }

  getRetainers(nodeId: number, snapshotId?: string, depth?: number, limit?: number): MemSnapshotRetainersResult {
    return queryRetainers(this.resolveSnapshot(snapshotId), nodeId, depth, limit);
  }

  getDiff(baseSnapshotId: string, compareSnapshotId: string, opts: DiffOptions = {}): MemSnapshotDiffResult {
    const base = this.store.get(baseSnapshotId);
    const compare = this.store.get(compareSnapshotId);
    if (!base) throw new Error(`Snapshot ${baseSnapshotId} not found`);
    if (!compare) throw new Error(`Snapshot ${compareSnapshotId} not found`);
    return queryDiff(base, compare, opts);
  }

  getLeakTriplet(
    baselineSnapshotId: string,
    actionSnapshotId: string,
    cleanupSnapshotId: string,
    limit?: number,
  ): MemLeakTripletResult {
    const baseline = this.store.get(baselineSnapshotId);
    const action = this.store.get(actionSnapshotId);
    const cleanup = this.store.get(cleanupSnapshotId);
    if (!baseline) throw new Error(`Snapshot ${baselineSnapshotId} not found`);
    if (!action) throw new Error(`Snapshot ${actionSnapshotId} not found`);
    if (!cleanup) throw new Error(`Snapshot ${cleanupSnapshotId} not found`);
    return queryLeakTriplet(baseline, action, cleanup, limit);
  }

  getLeakCandidates(snapshotId?: string, limit?: number): MemLeakCandidatesResult {
    return queryLeakCandidates(this.resolveSnapshot(snapshotId), limit);
  }

  private resolveSnapshot(snapshotId?: string): AnalyzedSnapshot {
    const snap = snapshotId ? this.store.get(snapshotId) : this.store.getLatest();
    if (!snap) {
      throw new Error(
        snapshotId
          ? `Snapshot ${snapshotId} not found`
          : "No heap snapshots available. Run mem-snapshot capture or mem-snapshot load first.",
      );
    }
    return snap;
  }
}

export type {
  ClassesOptions,
  DiffOptions,
  InstancesOptions,
} from "./query.js";

export type {
  MemLeakCandidatesResult,
  MemLeakTripletResult,
  MemSnapshotClassResult,
  MemSnapshotClassesResult,
  MemSnapshotDiffResult,
  MemSnapshotInstanceResult,
  MemSnapshotInstancesResult,
  MemSnapshotMeta,
  MemSnapshotRetainersResult,
  MemSnapshotSummaryResult,
} from "./types.js";
