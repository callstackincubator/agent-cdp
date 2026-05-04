import type {
  JsAllocationBucketedResult,
  JsAllocationExportResult,
  JsAllocationHotspotsResult,
  JsAllocationLeakSignalResult,
  JsAllocationSourceMapsResult,
  JsAllocationSession,
  JsAllocationSessionListEntry,
  JsAllocationStatusResult,
  JsAllocationSummaryResult,
} from "./types.js";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const ALLOCATION_CAVEATS = [
  "Sampling heap profiles show allocation pressure, not proof of retained leaks.",
  "Use heap snapshots to confirm whether allocations remain live after cleanup.",
];

export function queryStatus(result: JsAllocationStatusResult): JsAllocationStatusResult {
  return result;
}

export function querySessions(sessions: JsAllocationSession[], limit: number, offset: number): JsAllocationSessionListEntry[] {
  return sessions.slice(offset, offset + limit).map((session) => ({
    sessionId: session.sessionId,
    name: session.name,
    durationMs: Math.round(session.durationMs),
    sampleCount: session.sampleCount,
    totalBytes: session.totalBytes,
    startedAt: session.startedAt,
  }));
}

export function querySummary(session: JsAllocationSession): JsAllocationSummaryResult {
  const growingBucketTransitions = session.buckets.filter((bucket) => (bucket.deltaBytesFromPrev ?? 0) > 0).length;
  const largestJump = session.buckets.reduce((max, bucket) => Math.max(max, bucket.deltaBytesFromPrev ?? 0), 0);
  const symbolicatedPct =
    session.sourceMaps.totalMappableFrameCount > 0
      ? round1((session.sourceMaps.symbolicatedFrameCount / session.sourceMaps.totalMappableFrameCount) * 100)
      : 0;

  const evidence: string[] = [];
  if (session.lateAllocationSharePercent >= 35) {
    evidence.push(`${session.lateAllocationSharePercent}% of sampled bytes landed in the final bucket.`);
  }
  if (growingBucketTransitions >= Math.max(2, session.buckets.length - 2)) {
    evidence.push(`Allocation volume increased across ${growingBucketTransitions}/${Math.max(0, session.buckets.length - 1)} bucket transitions.`);
  }
  if (session.top1SharePercent >= 25) {
    evidence.push(`Top allocator accounts for ${session.top1SharePercent}% of sampled bytes.`);
  }
  if (session.sampleCount < 10) {
    evidence.push(`Only ${session.sampleCount} samples were collected, so allocation attribution is coarse.`);
  }
  if (evidence.length === 0) {
    evidence.push("No strong late-session or concentrated allocation signal detected.");
  }

  const caveats = [...ALLOCATION_CAVEATS];
  if (session.samplingIntervalBytes === undefined) {
    caveats.push("Sampling interval not configured — using runtime default precision.");
  }
  if (session.sampleCount === 0) {
    caveats.push("No samples were recorded in this session.");
  }

  return {
    session: {
      sessionId: session.sessionId,
      name: session.name,
      durationMs: Math.round(session.durationMs),
      sampleCount: session.sampleCount,
      totalBytes: session.totalBytes,
      samplingIntervalBytes: session.samplingIntervalBytes,
      stackDepth: session.stackDepth,
      includeObjectsCollectedByMajorGC: session.includeObjectsCollectedByMajorGC,
      includeObjectsCollectedByMinorGC: session.includeObjectsCollectedByMinorGC,
      symbolicationState: session.sourceMaps.state,
    },
    sourceMaps: {
      state: session.sourceMaps.state,
      bundleCount: session.sourceMaps.bundleUrls.length,
      resolvedCount: session.sourceMaps.resolvedSourceMapUrls.length,
      symbolicatedFramePercent: symbolicatedPct,
      notes:
        session.sourceMaps.state === "full"
          ? ["Allocation frames use original source positions where available."]
          : session.sourceMaps.state === "partial"
            ? ["Some allocation frames were symbolicated to original source files."]
            : session.sourceMaps.state === "failed"
              ? ["Source map resolution failed — reporting bundle-level allocation frames."]
              : ["No bundle scripts detected — reporting raw frame URLs."],
    },
    topAllocators: session.hotspots.slice(0, 5).map((hotspot) => {
      const frame = session.frames.get(hotspot.frameId);
      return {
        hotspotId: hotspot.hotspotId,
        functionName: frame?.functionName ?? "(unknown)",
        module: frame?.moduleName ?? "(unknown)",
        url: frame?.url ?? "",
        lineNumber: frame?.lineNumber ?? 0,
        columnNumber: frame?.columnNumber ?? 0,
        symbolicationStatus: frame?.symbolicationStatus ?? "not-applicable",
        selfBytes: hotspot.selfBytes,
        selfPercent: hotspot.selfPercent,
        sampleCount: hotspot.selfSampleCount,
      };
    }),
    topModules: session.modules.slice(0, 5).map((module) => ({
      module: module.moduleName,
      selfBytes: module.selfBytes,
      selfPercent: module.selfPercent,
      sampleCount: module.selfSampleCount,
    })),
    bucketTrend: {
      bucketCount: session.buckets.length,
      growingBucketTransitions,
      largestJump,
      lateAllocationSharePercent: session.lateAllocationSharePercent,
    },
    concentration: {
      top1SharePercent: session.top1SharePercent,
      top5SharePercent: session.top5SharePercent,
    },
    evidence,
    caveats,
  };
}

export function queryHotspots(
  session: JsAllocationSession,
  limit = 20,
  offset = 0,
  sortBy: string | undefined = undefined,
): JsAllocationHotspotsResult {
  let hotspots = [...session.hotspots];
  if (sortBy === "samples") {
    hotspots.sort((a, b) => b.selfSampleCount - a.selfSampleCount);
  } else {
    hotspots.sort((a, b) => b.selfBytes - a.selfBytes);
  }

  const total = hotspots.length;
  const symbolicatedPct =
    session.sourceMaps.totalMappableFrameCount > 0
      ? round1((session.sourceMaps.symbolicatedFrameCount / session.sourceMaps.totalMappableFrameCount) * 100)
      : 0;
  const items = hotspots.slice(offset, offset + limit).map((hotspot) => {
    const frame = session.frames.get(hotspot.frameId);
    return {
      hotspotId: hotspot.hotspotId,
      functionName: frame?.functionName ?? "(unknown)",
      module: frame?.moduleName ?? "(unknown)",
      url: frame?.url ?? "",
      lineNumber: frame?.lineNumber ?? 0,
      columnNumber: frame?.columnNumber ?? 0,
      symbolicationStatus: frame?.symbolicationStatus ?? "not-applicable",
      selfBytes: hotspot.selfBytes,
      totalBytes: hotspot.totalBytes,
      selfPercent: hotspot.selfPercent,
      totalPercent: hotspot.totalPercent,
      sampleCount: hotspot.selfSampleCount,
    };
  });

  return {
    sessionId: session.sessionId,
    total,
    offset,
    sourceMaps: {
      state: session.sourceMaps.state,
      symbolicatedFramePercent: symbolicatedPct,
    },
    items,
  };
}

export function queryBucketed(session: JsAllocationSession, limit = 5): JsAllocationBucketedResult {
  return {
    sessionId: session.sessionId,
    bucketCount: session.buckets.length,
    totalBytes: session.totalBytes,
    buckets: session.buckets.slice(-limit),
    caveats: [...ALLOCATION_CAVEATS],
  };
}

export function queryLeakSignal(session: JsAllocationSession): JsAllocationLeakSignalResult {
  let score = 0;
  const evidence: string[] = [];

  const growingBucketTransitions = session.buckets.filter((bucket) => (bucket.deltaBytesFromPrev ?? 0) > 0).length;
  const bucketTransitions = Math.max(0, session.buckets.length - 1);

  if (session.lateAllocationSharePercent >= 45) {
    score += 3;
    evidence.push(`Final bucket contains ${session.lateAllocationSharePercent}% of sampled bytes.`);
  } else if (session.lateAllocationSharePercent >= 30) {
    score += 2;
    evidence.push(`Late-session allocation share is elevated at ${session.lateAllocationSharePercent}%.`);
  }

  if (bucketTransitions > 0 && growingBucketTransitions >= Math.max(2, bucketTransitions - 1)) {
    score += 2;
    evidence.push(`Allocation bytes increased across ${growingBucketTransitions}/${bucketTransitions} bucket transitions.`);
  }

  if (session.top1SharePercent >= 30) {
    score += 1;
    evidence.push(`Top allocator contributes ${session.top1SharePercent}% of sampled bytes.`);
  }

  if (session.top5SharePercent >= 70) {
    score += 1;
    evidence.push(`Top five allocators contribute ${session.top5SharePercent}% of sampled bytes.`);
  }

  if (session.sampleCount < 10) {
    score = Math.max(0, score - 1);
    evidence.push(`Only ${session.sampleCount} samples were collected, reducing confidence.`);
  }

  if (evidence.length === 0) {
    evidence.push("No significant persistent allocation pressure detected.");
  }

  return {
    sessionId: session.sessionId,
    suspicionScore: score,
    level: score >= 5 ? "high" : score >= 3 ? "medium" : score >= 1 ? "low" : "none",
    evidence,
    caveat: "Sampling heap profiles are heuristic; confirm suspected leaks with heap snapshots.",
  };
}

export function queryExport(result: JsAllocationExportResult): JsAllocationExportResult {
  return result;
}

export function querySourceMaps(session: JsAllocationSession): JsAllocationSourceMapsResult {
  const symbolicatedPct =
    session.sourceMaps.totalMappableFrameCount > 0
      ? round1((session.sourceMaps.symbolicatedFrameCount / session.sourceMaps.totalMappableFrameCount) * 100)
      : 0;

  return {
    sessionId: session.sessionId,
    state: session.sourceMaps.state,
    bundleUrls: session.sourceMaps.bundleUrls,
    resolvedSourceMapUrls: session.sourceMaps.resolvedSourceMapUrls,
    symbolicatedFrameCount: session.sourceMaps.symbolicatedFrameCount,
    totalMappableFrameCount: session.sourceMaps.totalMappableFrameCount,
    symbolicatedFramePercent: symbolicatedPct,
    failures: session.sourceMaps.failures,
  };
}
