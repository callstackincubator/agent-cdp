import type {
  JsDiffResult,
  JsHotspotDetailResult,
  JsHotspotsResult,
  JsModulesResult,
  JsProfileStatusResult,
  JsProfileSummary,
  JsSessionListEntry,
  JsSliceResult,
  JsSourceMapsResult,
  JsStacksResult,
} from "./types.js";

export function formatJsProfileStatus(result: JsProfileStatusResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`JS Profiler: ${result.active ? "active" : "idle"}`);
    if (result.active && result.activeName) {
      lines.push(`Name: ${result.activeName}`);
    }
    if (result.elapsedMs !== null) {
      lines.push(`Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
    }
    lines.push(`Sessions: ${result.sessionCount}`);
    return lines.join("\n");
  }

  const name = result.active && result.activeName ? ` ${result.activeName}` : "";
  const elapsed = result.elapsedMs !== null ? ` elapsed:${(result.elapsedMs / 1000).toFixed(1)}s` : "";
  return `${result.active ? "active" : "idle"}${name}${elapsed} sessions:${result.sessionCount}`;
}

export function formatJsSessionList(entries: JsSessionListEntry[], verbose = false): string {
  if (entries.length === 0) return "No profile sessions";

  if (verbose) {
    const lines = [`Sessions (${entries.length}):`];
    for (const e of entries) {
      const date = new Date(e.startedAt).toISOString().slice(0, 19).replace("T", " ");
      lines.push(`  ${e.sessionId}  ${e.name}  ${(e.durationMs / 1000).toFixed(2)}s  ${e.sampleCount} samples  ${date}`);
    }
    return lines.join("\n");
  }

  return entries
    .map((e) => {
      const date = new Date(e.startedAt).toISOString().slice(0, 19).replace("T", " ");
      return `${e.sessionId}  ${e.name}  ${(e.durationMs / 1000).toFixed(2)}s  ${e.sampleCount} samples  ${date}`;
    })
    .join("\n");
}

export function formatJsProfileSummary(summary: JsProfileSummary, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    const s = summary.session;

    lines.push(`Session: ${s.name} (${s.sessionId})`);
    lines.push(
      `Duration: ${(s.durationMs / 1000).toFixed(2)}s | Samples: ${s.sampleCount}${
        s.samplingIntervalUs ? ` | Interval: ${s.samplingIntervalUs}μs` : ""
      }`,
    );

    const sm = summary.sourceMaps;
    lines.push(`Source maps: ${sm.state}${sm.bundleCount > 0 ? ` (${sm.symbolicatedFramePercent}% frames symbolicated)` : ""}`);
    for (const note of sm.notes) lines.push(`  - ${note}`);

    if (summary.topHotspots.length > 0) {
      lines.push("");
      lines.push("Top Hotspots (by self time):");
      for (const h of summary.topHotspots) {
        lines.push(`  ${h.hotspotId.padEnd(5)} ${String(h.selfPercent).padStart(5)}%  ${String(h.selfTimeMs).padStart(7)}ms  ${h.functionName}  ${h.module}`);
      }
    }

    if (summary.topModules.length > 0) {
      lines.push("");
      lines.push("Top Modules:");
      for (const m of summary.topModules) {
        lines.push(`  ${String(m.selfPercent).padStart(5)}%  ${String(m.selfTimeMs).padStart(7)}ms  ${m.module}`);
      }
    }

    if (summary.topStacks.length > 0) {
      lines.push("");
      lines.push("Top Stacks:");
      for (const st of summary.topStacks) {
        lines.push(`  ${st.stackId}  ${st.percent}%  ${st.frames.join(" → ")}`);
      }
    }

    if (summary.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of summary.caveats) {
        lines.push(`  - ${c}`);
      }
    }

    return lines.join("\n");
  }

  const s = summary.session;
  const sm = summary.sourceMaps;
  const interval = s.samplingIntervalUs ? ` interval:${s.samplingIntervalUs}μs` : "";
  const maps = sm.bundleCount > 0 ? ` maps:${sm.state} ${sm.symbolicatedFramePercent}%` : ` maps:${sm.state}`;
  const lines: string[] = [];
  lines.push(`${s.sessionId} ${s.name} ${(s.durationMs / 1000).toFixed(2)}s ${s.sampleCount} samples${interval}${maps}`);
  for (const h of summary.topHotspots) {
    lines.push(`  ${h.hotspotId.padEnd(5)} ${String(h.selfPercent).padStart(5)}%  ${String(h.selfTimeMs).padStart(7)}ms  ${h.functionName}  ${h.module}`);
  }
  return lines.join("\n");
}

export function formatJsHotspots(result: JsHotspotsResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    const showing = result.items.length;
    lines.push(`Hotspots — session ${result.sessionId} (${result.total} total, offset ${result.offset}, showing ${showing}):`);

    if (showing === 0) {
      lines.push("  No hotspots match the current filters.");
      return lines.join("\n");
    }

    lines.push(`  ${"ID".padEnd(6)} ${"SELF%".padStart(6)}  ${"SELF-MS".padStart(8)}  ${"TOTAL-MS".padStart(9)}  FUNCTION  MODULE`);
    for (const h of result.items) {
      lines.push(
        `  ${h.hotspotId.padEnd(6)} ${String(h.selfPercent).padStart(6)}  ${String(h.selfTimeMs).padStart(8)}  ${String(h.totalTimeMs).padStart(9)}  ${h.functionName}  ${h.module}`,
      );
    }
    return lines.join("\n");
  }

  if (result.items.length === 0) return "No hotspots match the current filters.";

  return result.items
    .map(
      (h) =>
        `${h.hotspotId.padEnd(6)} ${String(h.selfPercent).padStart(6)}  ${String(h.selfTimeMs).padStart(8)}  ${String(h.totalTimeMs).padStart(9)}  ${h.functionName}  ${h.module}`,
    )
    .join("\n");
}

export function formatJsHotspotDetail(result: JsHotspotDetailResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    const h = result.hotspot;
    const f = result.frame;

    lines.push(`Hotspot ${h.hotspotId}: ${f.functionName}`);
    lines.push(`  Module: ${f.moduleName}`);
    if (f.symbolicationStatus === "symbolicated" && f.url) {
      lines.push(`  Source: ${f.url}:${f.lineNumber + 1}:${f.columnNumber}`);
      if (f.bundleUrl) {
        lines.push(`  Bundle: ${f.bundleUrl}:${(f.bundleLineNumber ?? 0) + 1}:${f.bundleColumnNumber ?? 0}`);
      }
    } else if (f.url) {
      lines.push(`  File: ${f.url}:${f.lineNumber + 1}:${f.columnNumber}`);
      if (f.symbolicationStatus === "bundle-level") {
        lines.push(`  Symbolication: not mapped`);
      }
    }
    lines.push(`  Self:  ${h.selfPercent}% (${h.selfTimeMs}ms, ${h.selfSampleCount} samples)`);
    lines.push(`  Total: ${h.totalPercent}% (${h.totalTimeMs}ms, ${h.totalSampleCount} samples)`);

    if (result.representativeStacks.length > 0) {
      lines.push("");
      lines.push("Representative stacks:");
      for (const s of result.representativeStacks) {
        lines.push(`  ${s.stackId}  ${s.percent}%  ${s.frames.join(" → ")}`);
      }
    }

    if (result.activeTimeBuckets.length > 0) {
      lines.push("");
      lines.push("Active time ranges:");
      for (const b of result.activeTimeBuckets) {
        lines.push(`  ${b.startMs}–${b.endMs}ms (${b.sampleCount} samples)`);
      }
    }

    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  const h = result.hotspot;
  const f = result.frame;
  const lines: string[] = [];

  let location = "";
  if (f.symbolicationStatus === "symbolicated" && f.url) {
    location = ` ${f.url}:${f.lineNumber + 1}:${f.columnNumber}`;
  } else if (f.url) {
    location = ` ${f.url}:${f.lineNumber + 1}:${f.columnNumber}`;
  }
  lines.push(`${h.hotspotId} ${f.functionName} (${f.moduleName})${location}`);
  lines.push(`  self:${h.selfPercent}% ${h.selfTimeMs}ms  total:${h.totalPercent}% ${h.totalTimeMs}ms`);
  for (const s of result.representativeStacks) {
    lines.push(`  ${s.stackId} ${s.percent}% ${s.frames.join(" → ")}`);
  }
  return lines.join("\n");
}

export function formatJsModules(result: JsModulesResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Modules — session ${result.sessionId} (${result.total} total, offset ${result.offset}):`);

    if (result.items.length === 0) {
      lines.push("  No module data.");
      return lines.join("\n");
    }

    lines.push(`  ${"SELF%".padStart(6)}  ${"SELF-MS".padStart(8)}  ${"TOTAL-MS".padStart(9)}  MODULE`);
    for (const m of result.items) {
      lines.push(
        `  ${String(m.selfPercent).padStart(6)}  ${String(m.selfTimeMs).padStart(8)}  ${String(m.totalTimeMs).padStart(9)}  ${m.moduleName}`,
      );
    }
    return lines.join("\n");
  }

  if (result.items.length === 0) return "No module data.";

  return result.items
    .map(
      (m) =>
        `${String(m.selfPercent).padStart(6)}  ${String(m.selfTimeMs).padStart(8)}  ${String(m.totalTimeMs).padStart(9)}  ${m.moduleName}`,
    )
    .join("\n");
}

export function formatJsStacks(result: JsStacksResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Stacks — session ${result.sessionId} (${result.total} total, offset ${result.offset}):`);

    if (result.items.length === 0) {
      lines.push("  No stacks match the current filters.");
      return lines.join("\n");
    }

    for (const s of result.items) {
      lines.push(`  ${s.stackId}  ${s.percent}%  ${s.timeMs}ms  ${s.sampleCount} samples`);
      lines.push(`    ${s.frames.join(" → ")}`);
    }
    return lines.join("\n");
  }

  if (result.items.length === 0) return "No stacks match the current filters.";

  return result.items
    .map((s) => `${s.stackId}  ${s.percent}%  ${s.timeMs}ms  ${s.sampleCount} samples  ${s.frames.join(" → ")}`)
    .join("\n");
}

export function formatJsSlice(result: JsSliceResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    const { startMs, endMs } = result.requestedRange;

    lines.push(`Slice ${startMs}–${endMs}ms — session ${result.sessionId}`);
    lines.push(`  Samples: ${result.sampleCount} (${result.coveragePercent}% of total)`);

    if (result.topHotspots.length > 0) {
      lines.push("");
      lines.push("  Top hotspots in slice:");
      lines.push(`  ${"ID".padEnd(6)} ${"SELF%".padStart(6)}  SAMPLES  FUNCTION  MODULE`);
      for (const h of result.topHotspots) {
        lines.push(
          `  ${h.hotspotId.padEnd(6)} ${String(h.selfPercent).padStart(6)}  ${String(h.selfSampleCount).padStart(7)}  ${h.functionName}  ${h.module}`,
        );
      }
    }

    if (result.caveats.length > 0) {
      lines.push("");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  const { startMs, endMs } = result.requestedRange;
  const lines: string[] = [];
  lines.push(`${startMs}–${endMs}ms ${result.sampleCount} samples ${result.coveragePercent}%`);
  for (const h of result.topHotspots) {
    lines.push(
      `  ${h.hotspotId.padEnd(6)} ${String(h.selfPercent).padStart(6)}  ${String(h.selfSampleCount).padStart(7)}  ${h.functionName}  ${h.module}`,
    );
  }
  return lines.join("\n");
}

export function formatJsDiff(result: JsDiffResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Diff: ${result.base.name} (${result.base.sessionId}) → ${result.compare.name} (${result.compare.sessionId})`);
    lines.push(`  Base:    ${(result.base.durationMs / 1000).toFixed(2)}s, ${result.base.sampleCount} samples`);
    lines.push(`  Compare: ${(result.compare.durationMs / 1000).toFixed(2)}s, ${result.compare.sampleCount} samples`);

    if (result.regressed.length > 0) {
      lines.push("");
      lines.push("Regressions:");
      lines.push(`  ${"FUNCTION".padEnd(24)} ${"MODULE".padEnd(20)} ${"BASE-MS".padStart(8)}  ${"CMP-MS".padStart(8)}  ${"DELTA".padStart(8)}  DELTA%`);
      for (const d of result.regressed) {
        const pct = d.deltaSelfPct !== null ? `+${d.deltaSelfPct}%` : "new";
        lines.push(
          `  ${d.functionName.slice(0, 24).padEnd(24)} ${d.module.slice(0, 20).padEnd(20)} ${String(d.baseSelfMs).padStart(8)}  ${String(d.compareSelfMs).padStart(8)}  ${("+" + d.deltaSelfMs).padStart(8)}  ${pct}`,
        );
      }
    } else {
      lines.push("");
      lines.push("Regressions: none");
    }

    if (result.improved.length > 0) {
      lines.push("");
      lines.push("Improvements:");
      lines.push(`  ${"FUNCTION".padEnd(24)} ${"MODULE".padEnd(20)} ${"BASE-MS".padStart(8)}  ${"CMP-MS".padStart(8)}  ${"DELTA".padStart(8)}  DELTA%`);
      for (const d of result.improved) {
        const pct = d.deltaSelfPct !== null ? `${d.deltaSelfPct}%` : "n/a";
        lines.push(
          `  ${d.functionName.slice(0, 24).padEnd(24)} ${d.module.slice(0, 20).padEnd(20)} ${String(d.baseSelfMs).padStart(8)}  ${String(d.compareSelfMs).padStart(8)}  ${String(d.deltaSelfMs).padStart(8)}  ${pct}`,
        );
      }
    } else {
      lines.push("");
      lines.push("Improvements: none");
    }

    if (result.caveats.length > 0) {
      lines.push("");
      lines.push("Caveats:");
      for (const c of result.caveats) lines.push(`  - ${c}`);
    }

    return lines.join("\n");
  }

  const lines: string[] = [];
  lines.push(`${result.base.sessionId} → ${result.compare.sessionId}`);
  for (const d of result.regressed) {
    const pct = d.deltaSelfPct !== null ? `+${d.deltaSelfPct}%` : "new";
    lines.push(
      `R ${d.functionName.slice(0, 24).padEnd(24)} ${d.module.slice(0, 20).padEnd(20)} ${String(d.baseSelfMs).padStart(8)}ms → ${String(d.compareSelfMs).padStart(8)}ms  ${("+" + d.deltaSelfMs).padStart(8)}ms  ${pct}`,
    );
  }
  for (const d of result.improved) {
    const pct = d.deltaSelfPct !== null ? `${d.deltaSelfPct}%` : "n/a";
    lines.push(
      `I ${d.functionName.slice(0, 24).padEnd(24)} ${d.module.slice(0, 20).padEnd(20)} ${String(d.baseSelfMs).padStart(8)}ms → ${String(d.compareSelfMs).padStart(8)}ms  ${String(d.deltaSelfMs).padStart(8)}ms  ${pct}`,
    );
  }
  return lines.join("\n");
}

export function formatJsSourceMaps(result: JsSourceMapsResult, verbose = false): string {
  if (verbose) {
    const lines: string[] = [];
    lines.push(`Source maps — session ${result.sessionId}`);
    lines.push(`  State: ${result.state}`);

    if (result.totalMappableFrameCount > 0) {
      lines.push(`  Coverage: ${result.symbolicatedFramePercent}% (${result.symbolicatedFrameCount}/${result.totalMappableFrameCount} frames)`);
    }

    if (result.bundleUrls.length > 0) {
      lines.push("");
      lines.push("  Bundles detected:");
      for (const url of result.bundleUrls) lines.push(`    ${url}`);
    }

    if (result.resolvedSourceMapUrls.length > 0) {
      lines.push("");
      lines.push("  Source maps resolved:");
      for (const url of result.resolvedSourceMapUrls) lines.push(`    ${url}`);
    }

    if (result.failures.length > 0) {
      lines.push("");
      lines.push("  Failures:");
      for (const f of result.failures) lines.push(`    ${f.bundleUrl}: ${f.reason}`);
    }

    if (result.bundleUrls.length === 0 && result.failures.length === 0) {
      lines.push("  No bundle scripts detected in this profile.");
    }

    return lines.join("\n");
  }

  const coverage =
    result.totalMappableFrameCount > 0
      ? ` ${result.symbolicatedFramePercent}% (${result.symbolicatedFrameCount}/${result.totalMappableFrameCount} frames)`
      : "";
  return `${result.state}${coverage}`;
}
