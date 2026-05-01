import type { RuntimeSession } from "../types.js";
import { JsProfileCapture } from "./capture.js";
import { normalizeProfile } from "./normalize.js";
import {
  type HotspotsOptions,
  type ModulesOptions,
  type StacksOptions,
  queryDiff,
  queryHotspotDetail,
  queryHotspots,
  queryModules,
  querySessions,
  querySlice,
  queryStacks,
  querySummary,
} from "./query.js";
import { JsProfileStore } from "./store.js";
import type {
  JsDiffResult,
  JsHotspotDetailResult,
  JsHotspotsResult,
  JsModulesResult,
  JsProfileStatusResult,
  JsProfileSummary,
  JsSessionListEntry,
  JsSliceResult,
  JsStacksResult,
} from "./types.js";

export class JsProfiler {
  private readonly capture = new JsProfileCapture();
  private readonly store = new JsProfileStore();

  async start(session: RuntimeSession, name?: string, samplingIntervalUs?: number): Promise<void> {
    await this.capture.start(session, { name, samplingIntervalUs });
  }

  async stop(session: RuntimeSession): Promise<string> {
    const result = await this.capture.stop(session);
    const sessionId = this.store.generateId();
    const normalized = normalizeProfile(result.rawProfile, {
      sessionId,
      name: result.name,
      startedAt: result.startedAt,
      stoppedAt: result.stoppedAt,
      samplingIntervalUs: result.samplingIntervalUs,
    });
    this.store.add(normalized);
    return sessionId;
  }

  getStatus(): JsProfileStatusResult {
    return {
      active: this.capture.isActive(),
      activeName: this.capture.getActiveCaptureName(),
      elapsedMs: this.capture.getElapsedMs(),
      sessionCount: this.store.count(),
    };
  }

  listSessions(limit = 20, offset = 0): JsSessionListEntry[] {
    return querySessions(this.store.list(), limit, offset);
  }

  getSummary(sessionId?: string): JsProfileSummary {
    return querySummary(this.resolveSession(sessionId));
  }

  getHotspots(opts: HotspotsOptions): JsHotspotsResult {
    return queryHotspots(this.resolveSession(opts.sessionId), opts);
  }

  getHotspotDetail(hotspotId: string, sessionId?: string, stackLimit?: number): JsHotspotDetailResult {
    return queryHotspotDetail(this.resolveSession(sessionId), hotspotId, stackLimit);
  }

  getModules(opts: ModulesOptions): JsModulesResult {
    return queryModules(this.resolveSession(opts.sessionId), opts);
  }

  getStacks(opts: StacksOptions): JsStacksResult {
    return queryStacks(this.resolveSession(opts.sessionId), opts);
  }

  getSlice(startMs: number, endMs: number, sessionId?: string, limit?: number): JsSliceResult {
    return querySlice(this.resolveSession(sessionId), startMs, endMs, limit);
  }

  getDiff(
    baseSessionId: string,
    compareSessionId: string,
    limit?: number,
    minDeltaPct?: number,
  ): JsDiffResult {
    const base = this.store.get(baseSessionId);
    const compare = this.store.get(compareSessionId);
    if (!base) throw new Error(`Session ${baseSessionId} not found`);
    if (!compare) throw new Error(`Session ${compareSessionId} not found`);
    return queryDiff(base, compare, limit, minDeltaPct);
  }

  getRawProfile(sessionId?: string): unknown {
    return this.resolveSession(sessionId).rawProfile;
  }

  private resolveSession(sessionId?: string) {
    const session = sessionId ? this.store.get(sessionId) : this.store.getLatest();
    if (!session) {
      throw new Error(
        sessionId ? `Session ${sessionId} not found` : "No profile sessions available. Run js-profile start/stop first.",
      );
    }
    return session;
  }
}

export type {
  HotspotsOptions,
  ModulesOptions,
  StacksOptions,
} from "./query.js";

export type {
  JsDiffResult,
  JsHotspotDetailResult,
  JsHotspotsResult,
  JsModulesResult,
  JsProfileStatusResult,
  JsProfileSummary,
  JsSessionListEntry,
  JsSliceResult,
  JsStacksResult,
} from "./types.js";
