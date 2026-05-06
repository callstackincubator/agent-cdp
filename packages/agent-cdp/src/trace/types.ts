export type TraceEntryType = "measure" | "mark" | "stamp";
export type TraceEntrySource = "performance" | "console";
export type TraceTrackKind = "default" | "custom";
export type TraceEntrySort = "time" | "duration" | "name";

export interface RawTraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  id?: string | number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraceEntry {
  entryId: string;
  type: TraceEntryType;
  source: TraceEntrySource;
  name: string;
  track: string;
  trackKind: TraceTrackKind;
  trackGroup?: string;
  startMs: number;
  durationMs: number;
  color?: string;
  tooltipText?: string;
  properties?: Array<[string, string]>;
  userDetail?: unknown;
  isExtension: boolean;
}

export interface TraceTrack {
  trackId: string;
  name: string;
  kind: TraceTrackKind;
  group?: string;
  entryCount: number;
  measureCount: number;
  markCount: number;
  stampCount: number;
  activeMs: number;
  startMs: number;
  endMs: number;
}

export interface TraceSession {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  eventCount: number;
  filePath?: string;
  entries: TraceEntry[];
  entriesById: Map<string, TraceEntry>;
  tracks: TraceTrack[];
}

export interface TraceStatusResult {
  active: boolean;
  elapsedMs: number | null;
  sessionCount: number;
}

export interface TraceStopResult {
  sessionId: string;
  eventCount: number;
  filePath?: string;
  trackCount: number;
  entryCount: number;
  durationMs: number;
}

export interface TraceSessionListEntry {
  sessionId: string;
  name: string;
  durationMs: number;
  eventCount: number;
  entryCount: number;
  trackCount: number;
  startedAt: number;
}

export interface TraceSummaryResult {
  session: {
    sessionId: string;
    name: string;
    durationMs: number;
    eventCount: number;
    entryCount: number;
    trackCount: number;
    groupCount: number;
    startedAt: number;
  };
  entryCounts: {
    measure: number;
    mark: number;
    stamp: number;
  };
  topTracks: TraceTrack[];
}

export interface TraceTracksResult {
  sessionId: string;
  total: number;
  offset: number;
  items: TraceTrack[];
}

export interface TraceEntryFilters {
  sessionId?: string;
  track?: string;
  type?: TraceEntryType;
  text?: string;
  startMs?: number;
  endMs?: number;
  limit?: number;
  offset?: number;
  sortBy?: TraceEntrySort;
}

export interface TraceEntriesResult {
  sessionId: string;
  total: number;
  offset: number;
  items: TraceEntry[];
}

export interface TraceTrackFilters {
  sessionId?: string;
  group?: string;
  text?: string;
  limit?: number;
  offset?: number;
}
