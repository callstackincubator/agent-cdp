import type {
  TraceEntriesResult,
  TraceEntry,
  TraceEntryFilters,
  TraceSession,
  TraceSessionListEntry,
  TraceSummaryResult,
  TraceTrackFilters,
  TraceTracksResult,
} from "./types.js";

export function querySessions(sessions: TraceSession[], limit: number, offset: number): TraceSessionListEntry[] {
  return sessions.slice(offset, offset + limit).map((session) => ({
    sessionId: session.sessionId,
    name: session.name,
    durationMs: Math.round(session.durationMs),
    eventCount: session.eventCount,
    entryCount: session.entries.length,
    trackCount: session.tracks.length,
    startedAt: session.startedAt,
  }));
}

export function querySummary(session: TraceSession): TraceSummaryResult {
  return {
    session: {
      sessionId: session.sessionId,
      name: session.name,
      durationMs: Math.round(session.durationMs),
      eventCount: session.eventCount,
      entryCount: session.entries.length,
      trackCount: session.tracks.length,
      groupCount: new Set(session.tracks.map((track) => track.group).filter(Boolean)).size,
      startedAt: session.startedAt,
    },
    entryCounts: {
      measure: session.entries.filter((entry) => entry.type === "measure").length,
      mark: session.entries.filter((entry) => entry.type === "mark").length,
      stamp: session.entries.filter((entry) => entry.type === "stamp").length,
    },
    topTracks: session.tracks.slice(0, 5),
  };
}

export function queryTracks(session: TraceSession, filters: TraceTrackFilters): TraceTracksResult {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  let items = session.tracks;

  if (filters.group) {
    items = items.filter((track) => track.group === filters.group);
  }
  if (filters.text) {
    const needle = filters.text.toLowerCase();
    items = items.filter((track) => track.name.toLowerCase().includes(needle) || track.group?.toLowerCase().includes(needle));
  }

  return {
    sessionId: session.sessionId,
    total: items.length,
    offset,
    items: items.slice(offset, offset + limit),
  };
}

export function queryEntries(session: TraceSession, filters: TraceEntryFilters): TraceEntriesResult {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const sortBy = filters.sortBy ?? "duration";
  let items = session.entries;

  if (filters.type) {
    items = items.filter((entry) => entry.type === filters.type);
  }
  if (filters.track) {
    items = items.filter((entry) => entry.track === filters.track);
  }
  if (filters.text) {
    const needle = filters.text.toLowerCase();
    items = items.filter((entry) => {
      return entry.name.toLowerCase().includes(needle) || entry.track.toLowerCase().includes(needle) || entry.trackGroup?.toLowerCase().includes(needle);
    });
  }
  if (filters.startMs !== undefined) {
    items = items.filter((entry) => entry.startMs + entry.durationMs >= filters.startMs!);
  }
  if (filters.endMs !== undefined) {
    items = items.filter((entry) => entry.startMs <= filters.endMs!);
  }

  items = [...items].sort((a, b) => compareEntries(a, b, sortBy));

  return {
    sessionId: session.sessionId,
    total: items.length,
    offset,
    items: items.slice(offset, offset + limit),
  };
}

export function queryEntry(session: TraceSession, entryId: string): TraceEntry {
  const entry = session.entriesById.get(entryId);
  if (!entry) {
    throw new Error(`Trace entry ${entryId} not found in session ${session.sessionId}`);
  }
  return entry;
}

function compareEntries(a: TraceEntry, b: TraceEntry, sortBy: TraceEntryFilters["sortBy"]): number {
  if (sortBy === "name") {
    return a.name.localeCompare(b.name) || a.startMs - b.startMs;
  }
  if (sortBy === "time") {
    return a.startMs - b.startMs || b.durationMs - a.durationMs;
  }
  return b.durationMs - a.durationMs || a.startMs - b.startMs;
}
