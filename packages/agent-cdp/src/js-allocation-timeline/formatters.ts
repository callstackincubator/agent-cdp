import type {
  JsAllocationTimelineBucketsResult,
  JsAllocationTimelineExportResult,
  JsAllocationTimelineHotspotsResult,
  JsAllocationTimelineLeakSignalResult,
  JsAllocationTimelineSessionListEntry,
  JsAllocationTimelineStatusResult,
  JsAllocationTimelineSummaryResult,
} from "./types.js";

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1024 * 1024) return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
  if (abs >= 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

export function formatJsAllocationTimelineStatus(result: JsAllocationTimelineStatusResult, verbose = false): string {
  if (verbose) {
    const lines = [`JS Allocation Timeline: ${result.active ? "active" : "idle"}`];
    if (result.activeName) lines.push(`Name: ${result.activeName}`);
    if (result.elapsedMs !== null) lines.push(`Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
    lines.push(`Sessions: ${result.sessionCount}`);
    return lines.join("\n");
  }
  const name = result.activeName ? ` ${result.activeName}` : "";
  const elapsed = result.elapsedMs !== null ? ` elapsed:${(result.elapsedMs / 1000).toFixed(1)}s` : "";
  return `${result.active ? "active" : "idle"}${name}${elapsed} sessions:${result.sessionCount}`;
}

export function formatJsAllocationTimelineList(entries: JsAllocationTimelineSessionListEntry[], verbose = false): string {
  if (entries.length === 0) return "No allocation timeline sessions";
  if (verbose) {
    const lines = [`Allocation Timeline Sessions (${entries.length}):`];
    for (const entry of entries) {
      lines.push(
        `  ${entry.sessionId}  ${entry.name}  ${(entry.durationMs / 1000).toFixed(2)}s  ${entry.bucketCount} buckets  peak:${formatBytes(entry.peakTrackedSizeBytes)}  snapshot:${entry.snapshotId}  ${fmtDate(entry.startedAt)}`,
      );
    }
    return lines.join("\n");
  }
  return entries
    .map(
      (entry) =>
        `${entry.sessionId}  ${entry.name}  ${(entry.durationMs / 1000).toFixed(2)}s  ${entry.bucketCount} buckets  peak:${formatBytes(entry.peakTrackedSizeBytes)}  snapshot:${entry.snapshotId}  ${fmtDate(entry.startedAt)}`,
    )
    .join("\n");
}

export function formatJsAllocationTimelineSummary(result: JsAllocationTimelineSummaryResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Allocation Timeline Session: ${result.session.name} (${result.session.sessionId})`);
    lines.push(
      `Duration: ${(result.session.durationMs / 1000).toFixed(2)}s | Buckets: ${result.session.bucketCount} | Snapshot: ${result.session.snapshotId}`,
    );
    lines.push(
      `Peak tracked heap: ${formatBytes(result.session.peakTrackedSizeBytes)} across ${result.session.peakTrackedObjects} objects | Final/peak: ${result.session.lateTrackedSizeSharePercent}%`,
    );
    lines.push(`Source maps: ${result.sourceMaps.state}${result.sourceMaps.bundleCount > 0 ? ` (${result.sourceMaps.symbolicatedFramePercent}% traces symbolicated)` : ""}`);
    for (const note of result.sourceMaps.notes) lines.push(`  - ${note}`);
    if (result.topTraces.length > 0) {
      lines.push("");
      lines.push("Top Live Allocation Traces:");
      for (const trace of result.topTraces) {
        lines.push(
          `  ${String(trace.traceId).padEnd(6)} ${formatBytes(trace.liveSize).padStart(10)} live  ${String(trace.liveCount).padStart(5)} objs  ${trace.functionName}  ${trace.scriptName}${trace.scriptName ? `:${trace.line + 1}:${trace.column}` : ""}`,
        );
      }
    }
    if (result.evidence.length > 0) {
      lines.push("");
      lines.push("Evidence:");
      for (const evidence of result.evidence) lines.push(`  - ${evidence}`);
    }
    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const caveat of result.caveats) lines.push(`  - ${caveat}`);
    }
    return lines.join("\n");
  }

  const lines = [
    `${result.session.sessionId} ${result.session.name} ${(result.session.durationMs / 1000).toFixed(2)}s buckets:${result.session.bucketCount} peak:${formatBytes(result.session.peakTrackedSizeBytes)} final:${result.session.lateTrackedSizeSharePercent}% snapshot:${result.session.snapshotId}`,
  ];
  for (const trace of result.topTraces.slice(0, 3)) {
    lines.push(`  ${formatBytes(trace.liveSize).padStart(10)} ${trace.functionName}  ${trace.scriptName}`);
  }
  for (const evidence of result.evidence.slice(0, 3)) {
    lines.push(`evidence: ${evidence}`);
  }
  return lines.join("\n");
}

export function formatJsAllocationTimelineBuckets(result: JsAllocationTimelineBucketsResult, verbose = false): string {
  if (result.buckets.length === 0) return "No allocation timeline buckets available.";
  if (verbose) {
    const lines = [`Allocation Timeline Buckets — session ${result.sessionId} (snapshot ${result.snapshotId}):`];
    for (const bucket of result.buckets) {
      const delta = bucket.sizeDeltaFromPrev === null ? "n/a" : formatBytes(bucket.sizeDeltaFromPrev);
      lines.push(
        `  ${bucket.bucketId}  ${bucket.startPercent}-${bucket.endPercent}%  ${formatBytes(bucket.sizeBytes)}  ${bucket.objectCount} objs  delta:${delta}  lastId:${bucket.lastSeenObjectId}`,
      );
    }
    if (result.caveats.length > 0) {
      lines.push("");
      for (const caveat of result.caveats) lines.push(`  - ${caveat}`);
    }
    return lines.join("\n");
  }
  return result.buckets
    .map((bucket) => {
      const delta = bucket.sizeDeltaFromPrev === null ? "n/a" : formatBytes(bucket.sizeDeltaFromPrev);
      return `${bucket.bucketId} ${bucket.startPercent}-${bucket.endPercent}% ${formatBytes(bucket.sizeBytes)} ${bucket.objectCount} objs delta:${delta}`;
    })
    .join("\n");
}

export function formatJsAllocationTimelineHotspots(result: JsAllocationTimelineHotspotsResult, verbose = false): string {
  if (result.items.length === 0) return "No allocation timeline hotspots.";
  if (verbose) {
    const lines = [`Allocation Timeline Hotspots — session ${result.sessionId} (snapshot ${result.snapshotId}, ${result.total} total, offset ${result.offset}):`];
    lines.push(`  Source maps: ${result.sourceMaps.state}${result.sourceMaps.state !== "none" ? ` (${result.sourceMaps.symbolicatedFramePercent}% traces symbolicated)` : ""}`);
    for (const item of result.items) {
      lines.push(
        `  ${String(item.traceId).padEnd(6)} ${formatBytes(item.liveSize).padStart(10)} live  ${formatBytes(item.totalSize).padStart(10)} total  ${String(item.liveCount).padStart(5)} objs  ${item.functionName}  ${item.scriptName}${item.scriptName ? `:${item.line + 1}:${item.column}` : ""}`,
      );
    }
    return lines.join("\n");
  }
  return result.items
    .map(
      (item) =>
        `${String(item.traceId).padEnd(6)} ${formatBytes(item.liveSize).padStart(10)} live  ${String(item.liveCount).padStart(5)} objs  ${item.functionName}  ${item.scriptName}`,
    )
    .join("\n");
}

export function formatJsAllocationTimelineLeakSignal(result: JsAllocationTimelineLeakSignalResult, verbose = false): string {
  if (verbose) {
    const lines = [`JS Allocation Timeline Leak Signal:`, `  Level: ${result.level.toUpperCase()} (score: ${result.suspicionScore})`];
    if (result.evidence.length > 0) {
      lines.push("");
      lines.push("Evidence:");
      for (const evidence of result.evidence) lines.push(`  - ${evidence}`);
    }
    lines.push("");
    lines.push(`Caveat: ${result.caveat}`);
    return lines.join("\n");
  }
  return `${result.level.toUpperCase()} score:${result.suspicionScore}`;
}

export function formatJsAllocationTimelineExport(result: JsAllocationTimelineExportResult, verbose = false): string {
  if (verbose) {
    return `Allocation timeline artifact: ${result.name} (${result.sessionId})\nSnapshot: ${result.snapshotId}\nSaved to: ${result.filePath}\nBytes written: ${result.bytesWritten}`;
  }
  return `saved ${result.filePath} (${formatBytes(result.bytesWritten)})`;
}
