import type {
  TraceEntriesResult,
  TraceEntry,
  TraceSessionListEntry,
  TraceStatusResult,
  TraceStopResult,
  TraceSummaryResult,
  TraceTracksResult,
} from "./types.js";

function formatMs(ms: number): string {
  return `${ms.toFixed(ms >= 100 ? 0 : ms >= 10 ? 1 : 2)}ms`;
}

function truncate(text: string, max = 48): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function formatTraceStatus(result: TraceStatusResult, verbose = false): string {
  if (verbose) {
    const lines = [`Trace: ${result.active ? "active" : "idle"}`];
    if (result.elapsedMs !== null) {
      lines.push(`Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
    }
    lines.push(`Sessions: ${result.sessionCount}`);
    return lines.join("\n");
  }

  const elapsed = result.elapsedMs !== null ? ` elapsed:${(result.elapsedMs / 1000).toFixed(1)}s` : "";
  return `${result.active ? "active" : "idle"}${elapsed} sessions:${result.sessionCount}`;
}

export function formatTraceStop(result: TraceStopResult, verbose = false): string {
  if (verbose) {
    const lines = [
      `Trace session: ${result.sessionId}`,
      `Entries: ${result.entryCount} | Tracks: ${result.trackCount} | Raw events: ${result.eventCount}`,
      `Duration: ${formatMs(result.durationMs)}`,
    ];
    if (result.filePath) lines.push(`Saved to: ${result.filePath}`);
    return lines.join("\n");
  }
  return `${result.sessionId} ${result.entryCount} entries ${result.trackCount} tracks ${result.eventCount} events` +
    (result.filePath ? ` saved:${result.filePath}` : "");
}

export function formatTraceSessionList(entries: TraceSessionListEntry[], verbose = false): string {
  if (entries.length === 0) return "No trace sessions";

  return entries
    .map((entry) => {
      const date = new Date(entry.startedAt).toISOString().slice(0, 19).replace("T", " ");
      if (verbose) {
        return `${entry.sessionId}  ${entry.name}  ${formatMs(entry.durationMs)}  ${entry.entryCount} entries  ${entry.trackCount} tracks  ${entry.eventCount} events  ${date}`;
      }
      return `${entry.sessionId}  ${formatMs(entry.durationMs)}  ${entry.entryCount} entries  ${entry.trackCount} tracks  ${date}`;
    })
    .join("\n");
}

export function formatTraceSessionSummary(summary: TraceSummaryResult, verbose = false): string {
  const lines: string[] = [];
  const session = summary.session;
  lines.push(
    `${session.sessionId} ${session.name} ${formatMs(session.durationMs)} ${session.entryCount} entries ${session.trackCount} tracks ${session.eventCount} events`,
  );
  lines.push(
    `  measure:${summary.entryCounts.measure} mark:${summary.entryCounts.mark} stamp:${summary.entryCounts.stamp} groups:${session.groupCount}`,
  );
  for (const track of summary.topTracks) {
    lines.push(`  ${track.name} (${track.kind}) ${track.entryCount} entries` + (track.group ? ` group:${track.group}` : ""));
  }

  if (verbose) {
    lines.push(`  started:${new Date(session.startedAt).toISOString()}`);
  }
  return lines.join("\n");
}

export function formatTraceTracks(result: TraceTracksResult, verbose = false): string {
  if (result.items.length === 0) return "No trace tracks";
  return result.items
    .map((track) => {
      const base = `${track.name}  ${track.kind}  ${track.entryCount} entries  ${formatMs(track.endMs - track.startMs)}`;
      if (!verbose) {
        return track.group ? `${base}  ${track.group}` : base;
      }
      return `${base}  measures:${track.measureCount} marks:${track.markCount} stamps:${track.stampCount}` +
        (track.group ? `  group:${track.group}` : "");
    })
    .join("\n");
}

export function formatTraceEntries(result: TraceEntriesResult, verbose = false): string {
  if (result.items.length === 0) return "No trace entries match the current filters.";
  return result.items
    .map((entry) => {
      const base = `${entry.entryId}  ${entry.type}  ${formatMs(entry.durationMs)}  ${entry.track}  ${truncate(entry.name)}`;
      if (!verbose) {
        return base;
      }
      const extras = [`start:${formatMs(entry.startMs)}`, `source:${entry.source}`];
      if (entry.trackGroup) extras.push(`group:${entry.trackGroup}`);
      if (entry.color) extras.push(`color:${entry.color}`);
      return `${base}  ${extras.join("  ")}`;
    })
    .join("\n");
}

export function formatTraceEntry(entry: TraceEntry, verbose = false): string {
  const lines = [
    `${entry.entryId} ${entry.type} ${entry.name}`,
    `Track: ${entry.track}${entry.trackGroup ? ` (${entry.trackGroup})` : ""}`,
    `Start: ${formatMs(entry.startMs)} | Duration: ${formatMs(entry.durationMs)} | Source: ${entry.source}`,
    `Extension: ${entry.isExtension ? "yes" : "no"}`,
  ];
  if (entry.color) lines.push(`Color: ${entry.color}`);
  if (entry.tooltipText) lines.push(`Tooltip: ${entry.tooltipText}`);
  if (entry.properties && entry.properties.length > 0) {
    lines.push("Properties:");
    for (const [key, value] of entry.properties) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  if (verbose && entry.userDetail !== undefined && entry.userDetail !== null) {
    lines.push(`Detail: ${JSON.stringify(entry.userDetail)}`);
  }
  return lines.join("\n");
}
