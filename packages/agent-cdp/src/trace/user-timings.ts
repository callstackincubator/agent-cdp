import { parseConsoleExtensionData, parsePerformanceExtensionData } from "./extensions.js";
import type { RawTraceEvent, TraceEntry, TraceTrack } from "./types.js";

const DEFAULT_TRACK = "Timings";
const RESOURCE_TIMING_NAMES = new Set([
  "workerStart",
  "redirectStart",
  "redirectEnd",
  "fetchStart",
  "domainLookupStart",
  "domainLookupEnd",
  "connectStart",
  "connectEnd",
  "secureConnectionStart",
  "requestStart",
  "responseStart",
  "responseEnd",
  "navigationStart",
  "unloadEventStart",
  "unloadEventEnd",
  "commitNavigationEnd",
  "domLoading",
  "domInteractive",
  "domContentLoadedEventStart",
  "domContentLoadedEventEnd",
  "domComplete",
  "loadEventStart",
  "loadEventEnd",
]);

export function buildTraceEntries(
  events: RawTraceEvent[],
  originTs: number,
): { entries: TraceEntry[]; tracks: TraceTrack[]; durationMs: number } {
  const entries: TraceEntry[] = [];
  const asyncStarts = new Map<string, RawTraceEvent>();
  const namedTimestamps = new Map<string, RawTraceEvent>();
  let nextEntryId = 1;

  for (const event of events) {
    const category = typeof event.cat === "string" ? event.cat : "";
    if (category === "blink.user_timing") {
      if (isIgnoredUserTiming(event)) {
        continue;
      }

      const completeEntry = createPerformanceTimingEntry(event, nextEntryId, originTs);
      if (completeEntry) {
        entries.push(completeEntry.entry);
        nextEntryId = completeEntry.nextEntryId;
        continue;
      }

      const asyncKey = getAsyncEventKey(event);
      if (!asyncKey) {
        continue;
      }

      if (event.ph === "b" || event.ph === "B") {
        asyncStarts.set(asyncKey, event);
        continue;
      }

      if (event.ph === "e" || event.ph === "E") {
        const start = asyncStarts.get(asyncKey);
        if (!start) {
          continue;
        }
        asyncStarts.delete(asyncKey);
        const entry = createPairedPerformanceMeasure(start, event, nextEntryId++, originTs);
        if (entry) {
          entries.push(entry);
        }
      }
      continue;
    }

    if (category === "blink.console" || (category === "devtools.timeline" && event.name === "TimeStamp")) {
      const entry = createConsoleTimestampEntry(event, namedTimestamps, nextEntryId, originTs);
      if (entry) {
        entries.push(entry.entry);
        nextEntryId = entry.nextEntryId;
      }
    }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.startMs !== b.startMs) {
      return a.startMs - b.startMs;
    }
    if (a.durationMs !== b.durationMs) {
      return b.durationMs - a.durationMs;
    }
    return a.entryId.localeCompare(b.entryId);
  });

  const tracks = buildTracks(sortedEntries);
  const durationMs =
    sortedEntries.length === 0
      ? 0
      : Math.max(...sortedEntries.map((entry) => entry.startMs + entry.durationMs)) -
        Math.min(...sortedEntries.map((entry) => entry.startMs));
  return { entries: sortedEntries, tracks, durationMs };
}

function createPerformanceTimingEntry(
  event: RawTraceEvent,
  nextEntryId: number,
  originTs: number,
): { entry: TraceEntry; nextEntryId: number } | null {
  const phase = typeof event.ph === "string" ? event.ph : "";
  const hasDuration = typeof event.dur === "number" || phase === "X";
  const isInstant = phase === "I" || phase === "R" || phase === "i" || (!hasDuration && event.name === "performance.mark");

  if (!hasDuration && !isInstant) {
    return null;
  }

  const { devtools, userDetail } = parsePerformanceExtensionData(event);
  const type = hasDuration ? "measure" : "mark";
  const track = type === "measure" ? devtools?.track || DEFAULT_TRACK : devtools?.track || DEFAULT_TRACK;

  return {
    entry: {
      entryId: `te_${nextEntryId}`,
      type,
      source: "performance",
      name: typeof event.name === "string" ? event.name : "(unnamed)",
      track,
      trackKind: devtools?.track ? "custom" : "default",
      trackGroup: devtools?.trackGroup,
      startMs: timestampToMs(event.ts, originTs),
      durationMs: hasDuration ? microToMs(event.dur) : 0,
      color: devtools?.color,
      tooltipText: devtools?.tooltipText,
      properties: devtools?.properties,
      userDetail,
      isExtension: devtools !== null,
    },
    nextEntryId: nextEntryId + 1,
  };
}

function createPairedPerformanceMeasure(
  start: RawTraceEvent,
  end: RawTraceEvent,
  nextEntryId: number,
  originTs: number,
): TraceEntry | null {
  if (typeof start.ts !== "number" || typeof end.ts !== "number" || end.ts < start.ts) {
    return null;
  }

  const endData = parsePerformanceExtensionData(end);
  const startData = parsePerformanceExtensionData(start);
  const devtools = endData.devtools ?? startData.devtools;
  const userDetail = endData.userDetail ?? startData.userDetail;
  return {
    entryId: `te_${nextEntryId}`,
    type: "measure",
    source: "performance",
    name: typeof end.name === "string" ? end.name : typeof start.name === "string" ? start.name : "(unnamed)",
    track: devtools?.track || DEFAULT_TRACK,
    trackKind: devtools?.track ? "custom" : "default",
    trackGroup: devtools?.trackGroup,
    startMs: timestampToMs(start.ts, originTs),
    durationMs: microToMs(end.ts - start.ts),
    color: devtools?.color,
    tooltipText: devtools?.tooltipText,
    properties: devtools?.properties,
    userDetail,
    isExtension: devtools !== null,
  };
}

function createConsoleTimestampEntry(
  event: RawTraceEvent,
  namedTimestamps: Map<string, RawTraceEvent>,
  nextEntryId: number,
  originTs: number,
): { entry: TraceEntry; nextEntryId: number } | null {
  const data = event.args?.data;
  if (!isRecord(data) || typeof event.ts !== "number") {
    return null;
  }

  namedTimestamps.set(readConsoleTimestampName(data), event);
  const { devtools, userDetail } = parseConsoleExtensionData(event);
  const startTs = resolveConsoleTimestampBoundary(data.start, namedTimestamps, event.ts) ?? event.ts;
  const endTs = resolveConsoleTimestampBoundary(data.end, namedTimestamps, event.ts) ?? event.ts;
  const startMs = timestampToMs(startTs, originTs);
  const durationMs = Math.max(0, microToMs(endTs - startTs));

  return {
    entry: {
      entryId: `te_${nextEntryId}`,
      type: "stamp",
      source: "console",
      name: readConsoleTimestampName(data),
      track: devtools?.track || DEFAULT_TRACK,
      trackKind: devtools?.track ? "custom" : "default",
      trackGroup: devtools?.trackGroup,
      startMs,
      durationMs,
      color: devtools?.color,
      tooltipText: devtools?.tooltipText,
      properties: devtools?.properties,
      userDetail,
      isExtension: devtools !== null,
    },
    nextEntryId: nextEntryId + 1,
  };
}

function buildTracks(entries: TraceEntry[]): TraceTrack[] {
  const tracks = new Map<string, TraceTrack>();

  for (const entry of entries) {
    const key = `${entry.trackKind}:${entry.trackGroup || ""}:${entry.track}`;
    const existing = tracks.get(key);
    if (existing) {
      existing.entryCount += 1;
      existing.measureCount += entry.type === "measure" ? 1 : 0;
      existing.markCount += entry.type === "mark" ? 1 : 0;
      existing.stampCount += entry.type === "stamp" ? 1 : 0;
      existing.activeMs += entry.durationMs;
      existing.startMs = Math.min(existing.startMs, entry.startMs);
      existing.endMs = Math.max(existing.endMs, entry.startMs + entry.durationMs);
      continue;
    }

    tracks.set(key, {
      trackId: `tt_${tracks.size + 1}`,
      name: entry.track,
      kind: entry.trackKind,
      group: entry.trackGroup,
      entryCount: 1,
      measureCount: entry.type === "measure" ? 1 : 0,
      markCount: entry.type === "mark" ? 1 : 0,
      stampCount: entry.type === "stamp" ? 1 : 0,
      activeMs: entry.durationMs,
      startMs: entry.startMs,
      endMs: entry.startMs + entry.durationMs,
    });
  }

  return [...tracks.values()].sort((a, b) => {
    if (a.entryCount !== b.entryCount) {
      return b.entryCount - a.entryCount;
    }
    return a.name.localeCompare(b.name);
  });
}

function getAsyncEventKey(event: RawTraceEvent): string | null {
  if (typeof event.name !== "string") {
    return null;
  }

  const traceId = isRecord(event.args) && isRecord(event.args.data) && typeof event.args.data.traceId === "number"
    ? event.args.data.traceId
    : event.id;

  if (traceId === undefined || traceId === null) {
    return null;
  }

  return `${event.cat || ""}:${event.name}:${String(traceId)}`;
}

function isIgnoredUserTiming(event: RawTraceEvent): boolean {
  return typeof event.name === "string" && RESOURCE_TIMING_NAMES.has(event.name);
}

function readConsoleTimestampName(data: Record<string, unknown>): string {
  if (typeof data.name === "string") {
    return data.name;
  }
  if (typeof data.message === "string") {
    return data.message;
  }
  return "console.timeStamp";
}

function resolveConsoleTimestampBoundary(
  boundary: unknown,
  namedTimestamps: Map<string, RawTraceEvent>,
  eventTs: number,
): number | undefined {
  if (typeof boundary === "number") {
    if (boundary >= 0 && boundary < 1000) {
      return eventTs;
    }
    return boundary;
  }
  if (typeof boundary === "string") {
    return namedTimestamps.get(boundary)?.ts;
  }
  return undefined;
}

function microToMs(value: unknown): number {
  return typeof value === "number" ? Math.round((value / 1000) * 1000) / 1000 : 0;
}

function timestampToMs(value: unknown, originTs: number): number {
  return typeof value === "number" ? microToMs(value - originTs) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
