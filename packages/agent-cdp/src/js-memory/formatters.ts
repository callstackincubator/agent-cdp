import type {
  JsMemoryDiffResult,
  JsMemoryLeakSignalResult,
  JsMemoryListResult,
  JsMemorySampleResult,
  JsMemorySummaryResult,
  JsMemoryTrendResult,
} from "./types.js";

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1024 * 1024) {
    return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (abs >= 1024) {
    return `${sign}${(abs / 1024).toFixed(1)} KB`;
  }
  return `${n} B`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

export function formatJsMemorySample(result: JsMemorySampleResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Sample: ${result.sampleId}${result.label ? ` (${result.label})` : ""}`);
    lines.push(`  Captured: ${fmtDate(result.timestamp)}`);
    lines.push(`  Used JS heap: ${formatBytes(result.usedJSHeapSize)}`);
    lines.push(`  Total JS heap: ${formatBytes(result.totalJSHeapSize)}`);
    if (result.jsHeapSizeLimit > 0) {
      lines.push(`  Heap size limit: ${formatBytes(result.jsHeapSizeLimit)}`);
    }
    lines.push(`  Source: ${result.source}`);
    if (result.collectGarbageRequested) {
      lines.push(`  GC requested: yes`);
    }
    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }
    return lines.join("\n");
  }

  const label = result.label ? ` (${result.label})` : "";
  const gc = result.collectGarbageRequested ? " gc" : "";
  return `${result.sampleId}${label} used:${formatBytes(result.usedJSHeapSize)} total:${formatBytes(result.totalJSHeapSize)}${gc} at ${fmtDate(result.timestamp)}`;
}

export function formatJsMemoryList(result: JsMemoryListResult, verbose = false): string {
  if (result.total === 0) return "No JS memory samples captured.";

  if (verbose) {
    const lines = [`JS Memory Samples (${result.total} total, offset ${result.offset}, showing ${result.items.length}):`];
    lines.push(
      `  ${"ID".padEnd(10)} ${"LABEL".padEnd(20)} ${"USED".padStart(12)}  ${"TOTAL".padStart(12)}  CAPTURED`,
    );
    for (const s of result.items) {
      const label = (s.label ?? "").slice(0, 20).padEnd(20);
      lines.push(
        `  ${s.sampleId.padEnd(10)} ${label} ${formatBytes(s.usedJSHeapSize).padStart(12)}  ${formatBytes(s.totalJSHeapSize).padStart(12)}  ${fmtDate(s.timestamp)}`,
      );
    }
    return lines.join("\n");
  }

  return result.items
    .map((s) => {
      const label = (s.label ?? "").slice(0, 20).padEnd(20);
      return `${s.sampleId.padEnd(10)} ${label} ${formatBytes(s.usedJSHeapSize).padStart(12)}  ${formatBytes(s.totalJSHeapSize).padStart(12)}  ${fmtDate(s.timestamp)}`;
    })
    .join("\n");
}

export function formatJsMemorySummary(result: JsMemorySummaryResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Memory Summary (${result.sampleCount} sample${result.sampleCount === 1 ? "" : "s"}):`);

    if (result.sampleCount === 0) {
      lines.push("  No samples captured yet.");
      return lines.join("\n");
    }

    lines.push(`  Min used:  ${formatBytes(result.minUsed)}`);
    lines.push(`  Max used:  ${formatBytes(result.maxUsed)}`);
    lines.push(`  Avg used:  ${formatBytes(result.avgUsed)}`);
    lines.push(`  Growth:    ${formatBytes(result.growthOverSession)} (${result.growthPercent >= 0 ? "+" : ""}${result.growthPercent}%)`);

    if (result.suspicionNote) {
      lines.push("");
      lines.push(`Warning: ${result.suspicionNote}`);
    }

    if (result.latest) {
      lines.push("");
      lines.push("Latest sample:");
      lines.push(`  ${result.latest.sampleId}${result.latest.label ? ` (${result.latest.label})` : ""} — ${fmtDate(result.latest.timestamp)}`);
      lines.push(`  Used: ${formatBytes(result.latest.usedJSHeapSize)}  Total: ${formatBytes(result.latest.totalJSHeapSize)}`);
    }

    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  if (result.sampleCount === 0) return "No JS memory samples captured.";

  const lines: string[] = [];
  const growthSign = result.growthPercent >= 0 ? "+" : "";
  lines.push(`${result.sampleCount} samples: min:${formatBytes(result.minUsed)} max:${formatBytes(result.maxUsed)} avg:${formatBytes(result.avgUsed)} growth:${formatBytes(result.growthOverSession)} (${growthSign}${result.growthPercent}%)`);
  if (result.suspicionNote) lines.push(`warning: ${result.suspicionNote}`);
  if (result.latest) {
    const label = result.latest.label ? ` (${result.latest.label})` : "";
    lines.push(`  ${result.latest.sampleId}${label} used:${formatBytes(result.latest.usedJSHeapSize)} at ${fmtDate(result.latest.timestamp)}`);
  }
  return lines.join("\n");
}

export function formatJsMemoryDiff(result: JsMemoryDiffResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Memory Diff: ${result.baseSampleId} → ${result.compareSampleId}`);
    const sign = result.usedDelta >= 0 ? "+" : "";
    const pctSign = result.usedDeltaPercent >= 0 ? "+" : "";
    lines.push(`  Before used: ${formatBytes(result.beforeUsed)}`);
    lines.push(`  After used:  ${formatBytes(result.afterUsed)}`);
    lines.push(`  Delta used:  ${sign}${formatBytes(result.usedDelta)} (${pctSign}${result.usedDeltaPercent}%)`);
    lines.push(`  Before total: ${formatBytes(result.beforeTotal)}`);
    lines.push(`  After total:  ${formatBytes(result.afterTotal)}`);
    const totalSign = result.totalDelta >= 0 ? "+" : "";
    lines.push(`  Delta total:  ${totalSign}${formatBytes(result.totalDelta)}`);

    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  const usedSign = result.usedDelta >= 0 ? "+" : "";
  const pctSign = result.usedDeltaPercent >= 0 ? "+" : "";
  const totalSign = result.totalDelta >= 0 ? "+" : "";
  return `${result.baseSampleId} → ${result.compareSampleId}: used ${formatBytes(result.beforeUsed)}→${formatBytes(result.afterUsed)} (${usedSign}${formatBytes(result.usedDelta)} ${pctSign}${result.usedDeltaPercent}%) total ${formatBytes(result.beforeTotal)}→${formatBytes(result.afterTotal)} (${totalSign}${formatBytes(result.totalDelta)})`;
}

export function formatJsMemoryTrend(result: JsMemoryTrendResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Memory Trend (${result.checkpoints.length} checkpoint${result.checkpoints.length === 1 ? "" : "s"}):`);
    lines.push(`  Slope:         ${result.slope}`);
    const growthSign = result.totalGrowth >= 0 ? "+" : "";
    const pctSign = result.totalGrowthPercent >= 0 ? "+" : "";
    lines.push(`  Total growth:  ${growthSign}${formatBytes(result.totalGrowth)} (${pctSign}${result.totalGrowthPercent}%)`);
    lines.push(`  Largest jump:  ${formatBytes(result.largestJump)}`);

    if (result.checkpoints.length > 0) {
      lines.push("");
      lines.push(
        `  ${"ID".padEnd(10)} ${"LABEL".padEnd(16)} ${"USED".padStart(12)}  ${"DELTA".padStart(12)}  CAPTURED`,
      );
      for (const cp of result.checkpoints) {
        const delta =
          cp.deltaFromPrev === null
            ? "".padStart(12)
            : `${cp.deltaFromPrev >= 0 ? "+" : ""}${formatBytes(cp.deltaFromPrev)}`.padStart(12);
        const label = (cp.label ?? "").slice(0, 16).padEnd(16);
        lines.push(
          `  ${cp.sampleId.padEnd(10)} ${label} ${formatBytes(cp.usedJSHeapSize).padStart(12)}  ${delta}  ${fmtDate(cp.timestamp)}`,
        );
      }
    }

    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  const growthSign = result.totalGrowth >= 0 ? "+" : "";
  const pctSign = result.totalGrowthPercent >= 0 ? "+" : "";
  const lines: string[] = [];
  lines.push(`slope:${result.slope} growth:${growthSign}${formatBytes(result.totalGrowth)} (${pctSign}${result.totalGrowthPercent}%) largest:${formatBytes(result.largestJump)}`);
  for (const cp of result.checkpoints) {
    const delta =
      cp.deltaFromPrev === null
        ? "".padStart(12)
        : `${cp.deltaFromPrev >= 0 ? "+" : ""}${formatBytes(cp.deltaFromPrev)}`.padStart(12);
    const label = (cp.label ?? "").slice(0, 16).padEnd(16);
    lines.push(
      `${cp.sampleId.padEnd(10)} ${label} ${formatBytes(cp.usedJSHeapSize).padStart(12)}  ${delta}  ${fmtDate(cp.timestamp)}`,
    );
  }
  return lines.join("\n");
}

export function formatJsMemoryLeakSignal(result: JsMemoryLeakSignalResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Memory Leak Signal:`);
    lines.push(`  Level:  ${result.level.toUpperCase()} (score: ${result.suspicionScore})`);

    if (result.evidence.length > 0) {
      lines.push("");
      lines.push("Evidence:");
      for (const e of result.evidence) lines.push(`  - ${e}`);
    }

    lines.push("");
    lines.push(`Caveat: ${result.caveat}`);

    return lines.join("\n");
  }

  return `${result.level.toUpperCase()} score:${result.suspicionScore}`;
}
