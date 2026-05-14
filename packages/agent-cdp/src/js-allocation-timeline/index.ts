import fs from "node:fs/promises";
import path from "node:path";

import type { HeapSnapshotManager } from "../heap-snapshot/index.js";
import { resolveSourceMapsForCandidates } from "../source-maps.js";
import type { RuntimeSession } from "../types.js";
import { JsAllocationTimelineCapture } from "./capture.js";
import { normalizeAllocationTimeline } from "./normalize.js";
import {
  queryTimelineBuckets,
  queryTimelineExport,
  queryTimelineHotspots,
  queryTimelineLeakSignal,
  queryTimelineSessions,
  queryTimelineSourceMaps,
  queryTimelineStatus,
  queryTimelineSummary,
} from "./query.js";
import { JsAllocationTimelineStore } from "./store.js";
import type { JsAllocationTimelineCaptureOptions } from "./capture.js";
import type {
  JsAllocationTimelineBucketsResult,
  JsAllocationTimelineExportResult,
  JsAllocationTimelineHotspotsResult,
  JsAllocationTimelineLeakSignalResult,
  JsAllocationTimelineSourceMapsResult,
  JsAllocationTimelineSessionListEntry,
  JsAllocationTimelineStatusResult,
  JsAllocationTimelineSummaryResult,
} from "./types.js";

export class JsAllocationTimelineProfiler {
  private readonly capture = new JsAllocationTimelineCapture();
  private readonly store = new JsAllocationTimelineStore();

  constructor(private readonly heapSnapshotManager: HeapSnapshotManager) {}

  async start(session: RuntimeSession, options: JsAllocationTimelineCaptureOptions = {}): Promise<void> {
    await this.capture.start(session, options);
  }

  async stop(session: RuntimeSession): Promise<string> {
    const result = await this.capture.stop(session);
    const analyzed = this.heapSnapshotManager.ingestRawSnapshot(result.rawSnapshot, {
      name: `${result.name}-snapshot`,
      filePath: "",
      capturedAt: result.stoppedAt,
      collectGarbageRequested: false,
    });

    const sessionId = this.store.generateId();
    const traceCandidates = extractTraceCandidates(result.rawSnapshot);
    const sourceMaps = await resolveSourceMapsForCandidates(traceCandidates);
    const normalized = normalizeAllocationTimeline(result.rawSnapshot, {
      sessionId,
      name: result.name,
      startedAt: result.startedAt,
      stoppedAt: result.stoppedAt,
      rawSnapshotJson: result.rawSnapshotJson,
      chunkCount: result.chunkCount,
      heapSamples: result.heapSamples,
      snapshot: analyzed,
      sourceMaps,
    });

    this.store.add(normalized);
    return sessionId;
  }

  getStatus(): JsAllocationTimelineStatusResult {
    return queryTimelineStatus({
      active: this.capture.isActive(),
      activeName: this.capture.getActiveCaptureName(),
      elapsedMs: this.capture.getElapsedMs(),
      sessionCount: this.store.count(),
    });
  }

  listSessions(limit = 20, offset = 0): JsAllocationTimelineSessionListEntry[] {
    return queryTimelineSessions(this.store.list(), limit, offset);
  }

  getSummary(sessionId?: string): JsAllocationTimelineSummaryResult {
    return queryTimelineSummary(this.resolveSession(sessionId));
  }

  getBuckets(sessionId?: string, limit?: number): JsAllocationTimelineBucketsResult {
    return queryTimelineBuckets(this.resolveSession(sessionId), limit);
  }

  getHotspots(sessionId?: string, limit?: number, offset?: number): JsAllocationTimelineHotspotsResult {
    return queryTimelineHotspots(this.resolveSession(sessionId), limit, offset);
  }

  getLeakSignal(sessionId?: string): JsAllocationTimelineLeakSignalResult {
    return queryTimelineLeakSignal(this.resolveSession(sessionId));
  }

  getSourceMaps(sessionId?: string): JsAllocationTimelineSourceMapsResult {
    return queryTimelineSourceMaps(this.resolveSession(sessionId));
  }

  async exportToFile(filePath: string, sessionId?: string): Promise<JsAllocationTimelineExportResult> {
    const session = this.resolveSession(sessionId);
    const outputPath = path.resolve(filePath);
    await fs.writeFile(outputPath, session.rawSnapshotJson);
    return queryTimelineExport({
      sessionId: session.sessionId,
      snapshotId: session.snapshotId,
      name: session.name,
      filePath: outputPath,
      bytesWritten: Buffer.byteLength(session.rawSnapshotJson),
    });
  }

  private resolveSession(sessionId?: string) {
    const session = sessionId ? this.store.get(sessionId) : this.store.getLatest();
    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No allocation timeline sessions available. Run js-allocation-timeline start/stop first.",
      );
    }
    return session;
  }
}

function extractTraceCandidates(rawSnapshot: Parameters<typeof normalizeAllocationTimeline>[0]) {
  const fields = rawSnapshot.snapshot.meta.trace_function_info_fields ?? [];
  const data = rawSnapshot.trace_function_infos ?? [];
  if (fields.length === 0 || data.length === 0) return [];

  const fieldCount = fields.length;
  const scriptNameIdx = fields.indexOf("script_name");
  const lineIdx = fields.indexOf("line");
  const columnIdx = fields.indexOf("column");
  const candidates: Array<{ url: string; lineNumber: number; columnNumber: number }> = [];

  for (let i = 0; i + fieldCount - 1 < data.length; i += fieldCount) {
    candidates.push({
      url: rawSnapshot.strings[data[i + scriptNameIdx]] ?? "",
      lineNumber: data[i + lineIdx] ?? 0,
      columnNumber: data[i + columnIdx] ?? 0,
    });
  }

  return candidates;
}

export type { JsAllocationTimelineCaptureOptions } from "./capture.js";
export type {
  JsAllocationTimelineBucketsResult,
  JsAllocationTimelineExportResult,
  JsAllocationTimelineHotspotsResult,
  JsAllocationTimelineLeakSignalResult,
  JsAllocationTimelineSourceMapsResult,
  JsAllocationTimelineSessionListEntry,
  JsAllocationTimelineStatusResult,
  JsAllocationTimelineSummaryResult,
} from "./types.js";
