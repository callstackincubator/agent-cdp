import type { RuntimeSession } from "../types.js";
import { TraceRecorder } from "../trace.js";
import { normalizeTraceEvents } from "./load.js";
import {
  queryEntries,
  queryEntry,
  querySessions,
  querySummary,
  queryTracks,
} from "./query.js";
import { TraceStore } from "./store.js";
import type {
  TraceEntriesResult,
  TraceEntry,
  TraceEntryFilters,
  TraceSession,
  TraceSessionListEntry,
  TraceStatusResult,
  TraceStopResult,
  TraceSummaryResult,
  TraceTrackFilters,
  TraceTracksResult,
} from "./types.js";
import { buildTraceEntries } from "./user-timings.js";

export class TraceManager {
  private readonly recorder = new TraceRecorder();
  private readonly store = new TraceStore();

  async start(session: RuntimeSession): Promise<void> {
    await this.recorder.start(session);
  }

  async stop(filePath?: string): Promise<TraceStopResult> {
    const recording = await this.recorder.stop(filePath);
    const sessionId = this.store.generateId();
    const normalizedEvents = normalizeTraceEvents(recording.events);
    const analyzed = buildTraceEntries(normalizedEvents);
    const session: TraceSession = {
      sessionId,
      name: `trace-${sessionId}`,
      startedAt: recording.startedAt,
      stoppedAt: recording.stoppedAt,
      durationMs: analyzed.durationMs,
      eventCount: recording.eventCount,
      filePath: recording.filePath,
      entries: analyzed.entries,
      entriesById: new Map(analyzed.entries.map((entry) => [entry.entryId, entry])),
      tracks: analyzed.tracks,
    };
    this.store.add(session);
    return {
      sessionId,
      eventCount: recording.eventCount,
      filePath: recording.filePath,
      trackCount: session.tracks.length,
      entryCount: session.entries.length,
      durationMs: session.durationMs,
    };
  }

  isActive(): boolean {
    return this.recorder.isActive();
  }

  getStatus(): TraceStatusResult {
    return {
      active: this.recorder.isActive(),
      elapsedMs: this.recorder.getElapsedMs(),
      sessionCount: this.store.count(),
    };
  }

  listSessions(limit = 20, offset = 0): TraceSessionListEntry[] {
    return querySessions(this.store.list(), limit, offset);
  }

  getSummary(sessionId?: string): TraceSummaryResult {
    return querySummary(this.resolveSession(sessionId));
  }

  getTracks(filters: TraceTrackFilters): TraceTracksResult {
    return queryTracks(this.resolveSession(filters.sessionId), filters);
  }

  getEntries(filters: TraceEntryFilters): TraceEntriesResult {
    return queryEntries(this.resolveSession(filters.sessionId), filters);
  }

  getEntry(entryId: string, sessionId?: string): TraceEntry {
    return queryEntry(this.resolveSession(sessionId), entryId);
  }

  private resolveSession(sessionId?: string): TraceSession {
    const session = sessionId ? this.store.get(sessionId) : this.store.getLatest();
    if (!session) {
      throw new Error(sessionId ? `Trace session ${sessionId} not found` : "No trace sessions available. Run trace start/stop first.");
    }
    return session;
  }
}
