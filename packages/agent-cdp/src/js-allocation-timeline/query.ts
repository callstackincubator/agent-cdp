import type {
  JsAllocationTimelineBucketsResult,
  JsAllocationTimelineExportResult,
  JsAllocationTimelineHotspotsResult,
  JsAllocationTimelineLeakSignalResult,
  JsAllocationTimelineSourceMapsResult,
  JsAllocationTimelineSession,
  JsAllocationTimelineSessionListEntry,
  JsAllocationTimelineStatusResult,
  JsAllocationTimelineSummaryResult,
} from "./types.js";

const TIMELINE_CAVEATS = [
  "Allocations on timeline ends in a final heap snapshot with allocation data, not a full history of freed objects.",
  "Use heap snapshot retainers and diffs to confirm whether live allocations remain after cleanup.",
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function queryTimelineStatus(result: JsAllocationTimelineStatusResult): JsAllocationTimelineStatusResult {
  return result;
}

export function queryTimelineSessions(
  sessions: JsAllocationTimelineSession[],
  limit: number,
  offset: number,
): JsAllocationTimelineSessionListEntry[] {
  return sessions.slice(offset, offset + limit).map((session) => ({
    sessionId: session.sessionId,
    name: session.name,
    durationMs: Math.round(session.durationMs),
    bucketCount: session.buckets.length,
    peakTrackedSizeBytes: session.peakTrackedSizeBytes,
    snapshotId: session.snapshotId,
    startedAt: session.startedAt,
  }));
}

export function queryTimelineSummary(session: JsAllocationTimelineSession): JsAllocationTimelineSummaryResult {
  const growingBucketTransitions = session.buckets.filter((bucket) => (bucket.sizeDeltaFromPrev ?? 0) > 0).length;
  const largestTrackedSizeJump = session.buckets.reduce((max, bucket) => Math.max(max, bucket.sizeDeltaFromPrev ?? 0), 0);
  const finalTrackedSizeBytes = session.buckets.at(-1)?.sizeBytes ?? 0;
  const symbolicatedPct =
    session.sourceMaps.totalMappableFrameCount > 0
      ? round1((session.sourceMaps.symbolicatedFrameCount / session.sourceMaps.totalMappableFrameCount) * 100)
      : 0;

  const evidence: string[] = [];
  if (session.lateTrackedSizeSharePercent >= 80) {
    evidence.push(`Final tracked heap size stayed at ${session.lateTrackedSizeSharePercent}% of the session peak.`);
  }
  if (growingBucketTransitions >= Math.max(2, session.buckets.length - 2)) {
    evidence.push(`Tracked heap size increased across ${growingBucketTransitions}/${Math.max(0, session.buckets.length - 1)} bucket transitions.`);
  }
  if (session.topTraces[0]?.liveSize) {
    const top = session.topTraces[0];
    evidence.push(`Top live allocation trace is ${top.functionName} (${top.scriptName || "unknown script"}) with ${top.liveSize} bytes live.`);
  }
  if (evidence.length === 0) {
    evidence.push("No strong persistent live-allocation signal detected in the final timeline snapshot.");
  }

  return {
    session: {
      sessionId: session.sessionId,
      name: session.name,
      durationMs: Math.round(session.durationMs),
      bucketCount: session.buckets.length,
      snapshotId: session.snapshotId,
      peakTrackedObjects: session.peakTrackedObjects,
      peakTrackedSizeBytes: session.peakTrackedSizeBytes,
      lateTrackedSizeSharePercent: session.lateTrackedSizeSharePercent,
      symbolicationState: session.sourceMaps.state,
    },
    sourceMaps: {
      state: session.sourceMaps.state,
      bundleCount: session.sourceMaps.bundleUrls.length,
      resolvedCount: session.sourceMaps.resolvedSourceMapUrls.length,
      symbolicatedFramePercent: symbolicatedPct,
      notes:
        session.sourceMaps.state === "full"
          ? ["Allocation traces use original source positions where available."]
          : session.sourceMaps.state === "partial"
            ? ["Some allocation traces were symbolicated to original source files."]
            : session.sourceMaps.state === "failed"
              ? ["Source map resolution failed — reporting bundle-level allocation traces."]
              : ["No bundle scripts detected — reporting raw script names."],
    },
    topTraces: session.topTraces.slice(0, 5),
    bucketTrend: {
      growingBucketTransitions,
      largestTrackedSizeJump,
      finalTrackedSizeBytes,
    },
    evidence,
    caveats: [...TIMELINE_CAVEATS],
  };
}

export function queryTimelineBuckets(session: JsAllocationTimelineSession, limit = 5): JsAllocationTimelineBucketsResult {
  return {
    sessionId: session.sessionId,
    snapshotId: session.snapshotId,
    buckets: session.buckets.slice(-limit),
    caveats: [...TIMELINE_CAVEATS],
  };
}

export function queryTimelineHotspots(
  session: JsAllocationTimelineSession,
  limit = 20,
  offset = 0,
): JsAllocationTimelineHotspotsResult {
  const total = session.topTraces.length;
  const symbolicatedPct =
    session.sourceMaps.totalMappableFrameCount > 0
      ? round1((session.sourceMaps.symbolicatedFrameCount / session.sourceMaps.totalMappableFrameCount) * 100)
      : 0;
  return {
    sessionId: session.sessionId,
    snapshotId: session.snapshotId,
    total,
    offset,
    sourceMaps: {
      state: session.sourceMaps.state,
      symbolicatedFramePercent: symbolicatedPct,
    },
    items: session.topTraces.slice(offset, offset + limit),
  };
}

export function queryTimelineLeakSignal(session: JsAllocationTimelineSession): JsAllocationTimelineLeakSignalResult {
  let score = 0;
  const evidence: string[] = [];

  if (session.lateTrackedSizeSharePercent >= 85) {
    score += 3;
    evidence.push(`Final tracked heap size remained near peak (${session.lateTrackedSizeSharePercent}%).`);
  } else if (session.lateTrackedSizeSharePercent >= 65) {
    score += 2;
    evidence.push(`Final tracked heap size remained elevated at ${session.lateTrackedSizeSharePercent}% of peak.`);
  }

  const growingBucketTransitions = session.buckets.filter((bucket) => (bucket.sizeDeltaFromPrev ?? 0) > 0).length;
  if (growingBucketTransitions >= Math.max(2, session.buckets.length - 2)) {
    score += 2;
    evidence.push(`Tracked heap size grew across ${growingBucketTransitions}/${Math.max(0, session.buckets.length - 1)} bucket transitions.`);
  }

  if ((session.topTraces[0]?.liveSize ?? 0) >= 5 * 1024 * 1024) {
    score += 1;
    evidence.push(`Top live allocation trace retains at least 5 MB (${session.topTraces[0]?.liveSize} bytes).`);
  }

  if (evidence.length === 0) {
    evidence.push("No significant persistent live-allocation signal detected.");
  }

  return {
    sessionId: session.sessionId,
    suspicionScore: score,
    level: score >= 5 ? "high" : score >= 3 ? "medium" : score >= 1 ? "low" : "none",
    evidence,
    caveat: "Allocation timeline data is snapshot-backed and should be confirmed with cleanup and heap diff workflows.",
  };
}

export function queryTimelineExport(result: JsAllocationTimelineExportResult): JsAllocationTimelineExportResult {
  return result;
}

export function queryTimelineSourceMaps(session: JsAllocationTimelineSession): JsAllocationTimelineSourceMapsResult {
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
