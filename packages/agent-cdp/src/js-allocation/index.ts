import fs from "node:fs/promises";
import path from "node:path";

import type { RuntimeSession } from "../types.js";
import { resolveSourceMapsForCandidates } from "../source-maps.js";
import { JsAllocationCapture } from "./capture.js";
import type { JsAllocationCaptureOptions } from "./capture.js";
import { normalizeAllocationProfile } from "./normalize.js";
import { queryBucketed, queryExport, queryHotspots, queryLeakSignal, querySessions, querySourceMaps, queryStatus, querySummary } from "./query.js";
import { JsAllocationStore } from "./store.js";
import type {
  JsAllocationBucketedResult,
  JsAllocationExportResult,
  JsAllocationHotspotsResult,
  JsAllocationLeakSignalResult,
  JsAllocationSourceMapsResult,
  JsAllocationSessionListEntry,
  JsAllocationStatusResult,
  JsAllocationSummaryResult,
} from "./types.js";

export class JsAllocationProfiler {
  private readonly capture = new JsAllocationCapture();
  private readonly store = new JsAllocationStore();

  async start(session: RuntimeSession, options: JsAllocationCaptureOptions = {}): Promise<void> {
    await this.capture.start(session, options);
  }

  async stop(session: RuntimeSession): Promise<string> {
    const result = await this.capture.stop(session);
    const sessionId = this.store.generateId();
    const sourceMaps = await resolveSourceMapsForCandidates(
      flattenSamplingNodes(result.rawProfile).map((node) => ({
        url: node.callFrame.url,
        lineNumber: node.callFrame.lineNumber,
        columnNumber: node.callFrame.columnNumber,
      })),
    );
    const normalized = normalizeAllocationProfile(result.rawProfile, {
      sessionId,
      name: result.name,
      startedAt: result.startedAt,
      stoppedAt: result.stoppedAt,
      samplingIntervalBytes: result.samplingIntervalBytes,
      stackDepth: result.stackDepth,
      includeObjectsCollectedByMajorGC: result.includeObjectsCollectedByMajorGC,
      includeObjectsCollectedByMinorGC: result.includeObjectsCollectedByMinorGC,
      sourceMaps,
    });
    this.store.add(normalized);
    return sessionId;
  }

  getStatus(): JsAllocationStatusResult {
    return queryStatus({
      active: this.capture.isActive(),
      activeName: this.capture.getActiveCaptureName(),
      elapsedMs: this.capture.getElapsedMs(),
      sessionCount: this.store.count(),
    });
  }

  listSessions(limit = 20, offset = 0): JsAllocationSessionListEntry[] {
    return querySessions(this.store.list(), limit, offset);
  }

  getSummary(sessionId?: string): JsAllocationSummaryResult {
    return querySummary(this.resolveSession(sessionId));
  }

  getHotspots(sessionId?: string, limit?: number, offset?: number, sortBy?: string): JsAllocationHotspotsResult {
    return queryHotspots(this.resolveSession(sessionId), limit, offset, sortBy);
  }

  getBucketed(sessionId?: string, limit?: number): JsAllocationBucketedResult {
    return queryBucketed(this.resolveSession(sessionId), limit);
  }

  getLeakSignal(sessionId?: string): JsAllocationLeakSignalResult {
    return queryLeakSignal(this.resolveSession(sessionId));
  }

  getSourceMaps(sessionId?: string): JsAllocationSourceMapsResult {
    return querySourceMaps(this.resolveSession(sessionId));
  }

  async exportToFile(filePath: string, sessionId?: string): Promise<JsAllocationExportResult> {
    const session = this.resolveSession(sessionId);
    const outputPath = path.resolve(filePath);
    const contents = JSON.stringify(session.rawProfile, null, 2);
    await fs.writeFile(outputPath, contents);
    return queryExport({
      sessionId: session.sessionId,
      name: session.name,
      filePath: outputPath,
      bytesWritten: Buffer.byteLength(contents),
    });
  }

  private resolveSession(sessionId?: string) {
    const session = sessionId ? this.store.get(sessionId) : this.store.getLatest();
    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No allocation sessions available. Run js-allocation start/stop first.",
      );
    }
    return session;
  }
}

function flattenSamplingNodes(profile: Parameters<typeof normalizeAllocationProfile>[0]) {
  const nodes = [profile.head];
  const out: typeof nodes = [];
  while (nodes.length > 0) {
    const current = nodes.pop();
    if (!current) continue;
    out.push(current);
    for (const child of current.children ?? []) nodes.push(child);
  }
  return out;
}

export type {
  JsAllocationBucketedResult,
  JsAllocationExportResult,
  JsAllocationHotspotsResult,
  JsAllocationLeakSignalResult,
  JsAllocationSourceMapsResult,
  JsAllocationSessionListEntry,
  JsAllocationStatusResult,
  JsAllocationSummaryResult,
} from "./types.js";

export type { JsAllocationCaptureOptions } from "./capture.js";
