import type {
  JsAllocationBucketedResult,
  JsAllocationExportResult,
  JsAllocationHotspotsResult,
  JsAllocationLeakSignalResult,
  JsAllocationSessionListEntry,
  JsAllocationStatusResult,
  JsAllocationSummaryResult,
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

export function formatJsAllocationStatus(result: JsAllocationStatusResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Allocation: ${result.active ? "active" : "idle"}`);
    if (result.activeName) lines.push(`Name: ${result.activeName}`);
    if (result.elapsedMs !== null) lines.push(`Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
    lines.push(`Sessions: ${result.sessionCount}`);
    return lines.join("\n");
  }

  const name = result.activeName ? ` ${result.activeName}` : "";
  const elapsed = result.elapsedMs !== null ? ` elapsed:${(result.elapsedMs / 1000).toFixed(1)}s` : "";
  return `${result.active ? "active" : "idle"}${name}${elapsed} sessions:${result.sessionCount}`;
}

export function formatJsAllocationList(entries: JsAllocationSessionListEntry[], verbose = false): string {
  if (entries.length === 0) return "No allocation sessions";

  if (verbose) {
    const lines = [`Allocation Sessions (${entries.length}):`];
    for (const entry of entries) {
      lines.push(
        `  ${entry.sessionId}  ${entry.name}  ${(entry.durationMs / 1000).toFixed(2)}s  ${entry.sampleCount} samples  ${formatBytes(entry.totalBytes)}  ${fmtDate(entry.startedAt)}`,
      );
    }
    return lines.join("\n");
  }

  return entries
    .map(
      (entry) =>
        `${entry.sessionId}  ${entry.name}  ${(entry.durationMs / 1000).toFixed(2)}s  ${entry.sampleCount} samples  ${formatBytes(entry.totalBytes)}  ${fmtDate(entry.startedAt)}`,
    )
    .join("\n");
}

export function formatJsAllocationSummary(result: JsAllocationSummaryResult, verbose = false): string {
  const sessionLine = `${result.session.sessionId} ${result.session.name} ${(result.session.durationMs / 1000).toFixed(2)}s ${result.session.sampleCount} samples bytes:${formatBytes(result.session.totalBytes)}`;

  if (verbose) {
    const lines: string[] = [];
    lines.push(`Allocation Session: ${result.session.name} (${result.session.sessionId})`);
    lines.push(
      `Duration: ${(result.session.durationMs / 1000).toFixed(2)}s | Samples: ${result.session.sampleCount} | Total bytes: ${formatBytes(result.session.totalBytes)}`,
    );
    if (result.session.samplingIntervalBytes !== undefined) {
      lines.push(`Sampling interval: ${formatBytes(result.session.samplingIntervalBytes)}`);
    }
    if (result.session.stackDepth !== undefined) {
      lines.push(`Stack depth: ${result.session.stackDepth}`);
    }
    lines.push(
      `GC inclusion: major=${result.session.includeObjectsCollectedByMajorGC ? "yes" : "no"} minor=${result.session.includeObjectsCollectedByMinorGC ? "yes" : "no"}`,
    );
    lines.push(
      `Concentration: top1 ${result.concentration.top1SharePercent}% | top5 ${result.concentration.top5SharePercent}% | late ${result.bucketTrend.lateAllocationSharePercent}%`,
    );
    lines.push(`Source maps: ${result.sourceMaps.state}${result.sourceMaps.bundleCount > 0 ? ` (${result.sourceMaps.symbolicatedFramePercent}% frames symbolicated)` : ""}`);
    for (const note of result.sourceMaps.notes) lines.push(`  - ${note}`);

    if (result.topAllocators.length > 0) {
      lines.push("");
      lines.push("Top Allocators:");
      for (const allocator of result.topAllocators) {
        lines.push(
          `  ${allocator.hotspotId.padEnd(10)} ${String(allocator.selfPercent).padStart(5)}%  ${formatBytes(allocator.selfBytes).padStart(10)}  ${String(allocator.sampleCount).padStart(4)} samples  ${allocator.functionName}  ${allocator.module}${allocator.url ? `  ${allocator.url}:${allocator.lineNumber + 1}:${allocator.columnNumber}` : ""}`,
        );
      }
    }

    if (result.topModules.length > 0) {
      lines.push("");
      lines.push("Top Modules:");
      for (const module of result.topModules) {
        lines.push(
          `  ${String(module.selfPercent).padStart(5)}%  ${formatBytes(module.selfBytes).padStart(10)}  ${String(module.sampleCount).padStart(4)} samples  ${module.module}`,
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

  const lines: string[] = [sessionLine];
  for (const allocator of result.topAllocators.slice(0, 3)) {
    lines.push(
      `  ${String(allocator.selfPercent).padStart(5)}% ${formatBytes(allocator.selfBytes).padStart(10)} ${allocator.functionName}  ${allocator.module}`,
    );
  }
  for (const evidence of result.evidence.slice(0, 3)) {
    lines.push(`evidence: ${evidence}`);
  }
  return lines.join("\n");
}

export function formatJsAllocationHotspots(result: JsAllocationHotspotsResult, verbose = false): string {
  if (result.items.length === 0) return "No allocation hotspots.";

  if (verbose) {
    const lines = [`Allocation Hotspots — session ${result.sessionId} (${result.total} total, offset ${result.offset}):`];
    lines.push(`  Source maps: ${result.sourceMaps.state}${result.sourceMaps.state !== "none" ? ` (${result.sourceMaps.symbolicatedFramePercent}% frames symbolicated)` : ""}`);
    lines.push(`  ${"ID".padEnd(10)} ${"SELF%".padStart(6)}  ${"SELF".padStart(10)}  ${"TOTAL".padStart(10)}  SAMPLES  FUNCTION  MODULE`);
    for (const item of result.items) {
      lines.push(
        `  ${item.hotspotId.padEnd(10)} ${String(item.selfPercent).padStart(6)}  ${formatBytes(item.selfBytes).padStart(10)}  ${formatBytes(item.totalBytes).padStart(10)}  ${String(item.sampleCount).padStart(7)}  ${item.functionName}  ${item.module}${item.url ? `  ${item.url}:${item.lineNumber + 1}:${item.columnNumber}` : ""}`,
      );
    }
    return lines.join("\n");
  }

  return result.items
    .map(
      (item) =>
        `${item.hotspotId.padEnd(10)} ${String(item.selfPercent).padStart(6)}  ${formatBytes(item.selfBytes).padStart(10)}  ${String(item.sampleCount).padStart(7)}  ${item.functionName}  ${item.module}`,
    )
    .join("\n");
}

export function formatJsAllocationBucketed(result: JsAllocationBucketedResult, verbose = false): string {
  if (result.buckets.length === 0) return "No allocation buckets available.";

  if (verbose) {
    const lines = [`Allocation Buckets — session ${result.sessionId} (${result.bucketCount} total):`];
    lines.push(`  Total bytes: ${formatBytes(result.totalBytes)}`);
    for (const bucket of result.buckets) {
      const delta = bucket.deltaBytesFromPrev === null ? "n/a" : formatBytes(bucket.deltaBytesFromPrev);
      lines.push(
        `  ${bucket.bucketId}  ${bucket.startPercent}-${bucket.endPercent}%  ${formatBytes(bucket.bytes)}  ${bucket.sampleCount} samples  delta:${delta}`,
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
      const delta = bucket.deltaBytesFromPrev === null ? "n/a" : formatBytes(bucket.deltaBytesFromPrev);
      return `${bucket.bucketId} ${bucket.startPercent}-${bucket.endPercent}% ${formatBytes(bucket.bytes)} ${bucket.sampleCount} samples delta:${delta}`;
    })
    .join("\n");
}

export function formatJsAllocationLeakSignal(result: JsAllocationLeakSignalResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Allocation Leak Signal:`);
    lines.push(`  Level: ${result.level.toUpperCase()} (score: ${result.suspicionScore})`);
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

export function formatJsAllocationExport(result: JsAllocationExportResult, verbose = false): string {
  if (verbose) {
    return `Allocation artifact: ${result.name} (${result.sessionId})\nSaved to: ${result.filePath}\nBytes written: ${result.bytesWritten}`;
  }
  return `saved ${result.filePath} (${formatBytes(result.bytesWritten)})`;
}
