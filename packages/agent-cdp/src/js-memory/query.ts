import { JS_HEAP_CAVEATS } from "./capture.js";
import type {
  JsMemoryDiffResult,
  JsMemoryLeakSignalResult,
  JsMemoryListResult,
  JsMemorySample,
  JsMemorySampleResult,
  JsMemorySummaryResult,
  JsMemoryTrendCheckpoint,
  JsMemoryTrendResult,
} from "./types.js";

const MB = 1024 * 1024;

function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

function toResult(sample: JsMemorySample): JsMemorySampleResult {
  return {
    sampleId: sample.sampleId,
    label: sample.label,
    timestamp: sample.timestamp,
    usedJSHeapSize: sample.usedJSHeapSize,
    totalJSHeapSize: sample.totalJSHeapSize,
    jsHeapSizeLimit: sample.jsHeapSizeLimit,
    source: sample.source,
    collectGarbageRequested: sample.collectGarbageRequested,
    caveats: JS_HEAP_CAVEATS,
  };
}

export function querySampleResult(sample: JsMemorySample): JsMemorySampleResult {
  return toResult(sample);
}

export function queryList(samples: JsMemorySample[], limit = 20, offset = 0): JsMemoryListResult {
  const total = samples.length;
  const items = samples.slice(offset, offset + limit).map(toResult);
  return { total, offset, items };
}

export function querySummary(samples: JsMemorySample[]): JsMemorySummaryResult {
  if (samples.length === 0) {
    return {
      latest: null,
      sampleCount: 0,
      minUsed: 0,
      maxUsed: 0,
      avgUsed: 0,
      growthOverSession: 0,
      growthPercent: 0,
      suspicionNote: null,
      caveats: JS_HEAP_CAVEATS,
    };
  }

  const used = samples.map((s) => s.usedJSHeapSize);
  const minUsed = Math.min(...used);
  const maxUsed = Math.max(...used);
  const avgUsed = Math.round(used.reduce((a, b) => a + b, 0) / used.length);
  const first = samples[0].usedJSHeapSize;
  const last = samples.at(-1)!.usedJSHeapSize;
  const growthOverSession = last - first;
  const growthPercent = first > 0 ? Math.round((growthOverSession / first) * 10000) / 100 : 0;

  let suspicionNote: string | null = null;
  if (samples.length >= 3) {
    const { slope } = computeSlope(samples);
    if (slope === "increasing") {
      suspicionNote = "usedJSHeapSize is trending upward across all samples — potential leak signal.";
    } else if (growthOverSession > 10 * 1024 * 1024) {
      suspicionNote = "JS heap grew by more than 10 MB over the session — consider investigating.";
    }
  }

  return {
    latest: toResult(samples.at(-1)!),
    sampleCount: samples.length,
    minUsed,
    maxUsed,
    avgUsed,
    growthOverSession,
    growthPercent,
    suspicionNote,
    caveats: JS_HEAP_CAVEATS,
  };
}

export function queryDiff(base: JsMemorySample, compare: JsMemorySample): JsMemoryDiffResult {
  const usedDelta = compare.usedJSHeapSize - base.usedJSHeapSize;
  const usedDeltaPercent =
    base.usedJSHeapSize > 0 ? Math.round((usedDelta / base.usedJSHeapSize) * 10000) / 100 : 0;
  const totalDelta = compare.totalJSHeapSize - base.totalJSHeapSize;

  return {
    baseSampleId: base.sampleId,
    compareSampleId: compare.sampleId,
    beforeUsed: base.usedJSHeapSize,
    afterUsed: compare.usedJSHeapSize,
    usedDelta,
    usedDeltaPercent,
    beforeTotal: base.totalJSHeapSize,
    afterTotal: compare.totalJSHeapSize,
    totalDelta,
    caveats: JS_HEAP_CAVEATS,
  };
}

function computeSlope(samples: JsMemorySample[]): {
  slope: "increasing" | "decreasing" | "stable" | "oscillating";
  monotoneUp: boolean;
  monotoneDown: boolean;
} {
  if (samples.length < 2) {
    return { slope: "stable", monotoneUp: false, monotoneDown: false };
  }

  let monotoneUp = true;
  let monotoneDown = true;
  let increasing = 0;
  let decreasing = 0;

  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].usedJSHeapSize - samples[i - 1].usedJSHeapSize;
    if (delta > 0) increasing++;
    else if (delta < 0) decreasing++;
    if (delta <= 0) monotoneUp = false;
    if (delta >= 0) monotoneDown = false;
  }

  const total = samples.length - 1;
  let slope: "increasing" | "decreasing" | "stable" | "oscillating";
  if (monotoneUp) {
    slope = "increasing";
  } else if (monotoneDown) {
    slope = "decreasing";
  } else if (increasing >= total * 0.75) {
    slope = "increasing";
  } else if (decreasing >= total * 0.75) {
    slope = "decreasing";
  } else if (increasing > 0 && decreasing > 0) {
    slope = "oscillating";
  } else {
    slope = "stable";
  }

  return { slope, monotoneUp, monotoneDown };
}

export function queryTrend(samples: JsMemorySample[], limit = 50): JsMemoryTrendResult {
  const recent = samples.slice(-limit);

  const checkpoints: JsMemoryTrendCheckpoint[] = recent.map((s, idx) => ({
    sampleId: s.sampleId,
    label: s.label,
    timestamp: s.timestamp,
    usedJSHeapSize: s.usedJSHeapSize,
    deltaFromPrev: idx === 0 ? null : s.usedJSHeapSize - recent[idx - 1].usedJSHeapSize,
  }));

  const { slope } = computeSlope(recent);

  const first = recent[0]?.usedJSHeapSize ?? 0;
  const last = recent.at(-1)?.usedJSHeapSize ?? 0;
  const totalGrowth = last - first;
  const totalGrowthPercent = first > 0 ? Math.round((totalGrowth / first) * 10000) / 100 : 0;

  const deltas = checkpoints.slice(1).map((c) => Math.abs(c.deltaFromPrev ?? 0));
  const largestJump = deltas.length > 0 ? Math.max(...deltas) : 0;

  return {
    checkpoints,
    slope,
    totalGrowth,
    totalGrowthPercent,
    largestJump,
    caveats: JS_HEAP_CAVEATS,
  };
}

export function queryLeakSignal(
  samples: JsMemorySample[],
  options: { scoped?: boolean } = {},
): JsMemoryLeakSignalResult {
  const sampleCount = samples.length;
  const scope: JsMemoryLeakSignalResult["scope"] = options.scoped ? "bounded" : "full-history";
  const windowStartSampleId = samples[0]?.sampleId ?? null;
  const windowEndSampleId = samples.at(-1)?.sampleId ?? null;

  if (sampleCount < 2) {
    return {
      suspicionScore: 0,
      level: "none",
      confidence: "low",
      sampleCount,
      scope,
      windowStartSampleId,
      windowEndSampleId,
      evidence: ["Need at least two checkpoints to compare heap growth."],
      qualityNotes: ["Capture a bounded baseline and follow-up sample before using leak-signal."],
      caveat: "This is a heuristic signal, not proof of a leak. Use heap snapshots for confirmation.",
    };
  }

  const evidence: string[] = [];
  const qualityNotes: string[] = [];
  let score = 0;
  let confidenceScore = 0;

  if (options.scoped) {
    confidenceScore += 1;
  } else {
    qualityNotes.push("This result spans all stored samples in the daemon. Mixed workflows can skew the signal; rerun with --since SAMPLE_ID for one bounded check.");
  }

  if (sampleCount >= 4) {
    confidenceScore += 1;
  } else {
    qualityNotes.push(`Only ${sampleCount} sample${sampleCount === 1 ? "" : "s"} in this window; leak confidence is limited.`);
  }

  const { slope, monotoneUp } = computeSlope(samples);
  const baseline = samples[0];
  const latest = samples.at(-1)!;
  const peak = samples.reduce((max, sample) => (sample.usedJSHeapSize > max.usedJSHeapSize ? sample : max), samples[0]);
  const totalGrowthBytes = latest.usedJSHeapSize - baseline.usedJSHeapSize;

  evidence.push(
    `Window ${windowStartSampleId} -> ${windowEndSampleId}: baseline ${formatMb(baseline.usedJSHeapSize)}, peak ${formatMb(peak.usedJSHeapSize)}, latest ${formatMb(latest.usedJSHeapSize)}.`,
  );

  const postGcSample = [...samples].reverse().find((sample) => sample.collectGarbageRequested);

  if (postGcSample) {
    confidenceScore += 2;
    const retainedAfterGc = postGcSample.usedJSHeapSize - baseline.usedJSHeapSize;
    const recoveryFromPeak = peak.usedJSHeapSize - postGcSample.usedJSHeapSize;
    const peakGrowth = peak.usedJSHeapSize - baseline.usedJSHeapSize;
    const retainedShare = peakGrowth > 0 ? retainedAfterGc / peakGrowth : 0;

    evidence.push(
      `Post-GC checkpoint ${postGcSample.sampleId} is ${retainedAfterGc >= 0 ? "+" : ""}${formatMb(retainedAfterGc)} vs baseline after ${recoveryFromPeak >= 0 ? "+" : ""}${formatMb(recoveryFromPeak)} of recovery from the peak.`,
    );

    if (retainedAfterGc >= 20 * MB && retainedShare >= 0.6) {
      score += 4;
      evidence.push("Most peak growth remains after a GC-assisted checkpoint, which is a strong retention signal.");
    } else if (retainedAfterGc >= 8 * MB && retainedShare >= 0.5) {
      score += 3;
      evidence.push("A large share of the peak growth remains after GC, which is consistent with retained objects.");
    } else if (retainedAfterGc >= 3 * MB && retainedShare >= 0.35) {
      score += 1;
      evidence.push("Some post-GC growth remains above baseline, but the retained floor is modest.");
    } else {
      evidence.push("The heap recovered close to baseline after GC, which weakens the leak signal.");
    }
  } else {
    qualityNotes.push("No GC-assisted checkpoint in this window; the signal is trend-based and lower confidence.");
  }

  if (monotoneUp) {
    score += postGcSample ? 1 : 2;
    evidence.push(`usedJSHeapSize increased monotonically across all ${sampleCount} samples.`);
  } else if (slope === "increasing") {
    score += postGcSample ? 1 : 2;
    evidence.push("usedJSHeapSize shows a predominantly increasing trend.");
  } else if (slope === "oscillating") {
    qualityNotes.push("Samples oscillate instead of following a clean progression, which lowers confidence.");
  }

  const growthMb = totalGrowthBytes / MB;
  const growthPct = baseline.usedJSHeapSize > 0 ? (totalGrowthBytes / baseline.usedJSHeapSize) * 100 : 0;

  if (!postGcSample && growthMb > 10) {
    score += 1;
    evidence.push(`Total growth exceeds 10 MB (${growthMb.toFixed(1)} MB), but without a post-GC checkpoint this is only a weak trend signal.`);
  } else if (postGcSample && growthMb > 10) {
    score += 1;
    evidence.push(`Latest heap is still ${growthPct.toFixed(1)}% above the baseline.`);
  }

  const level: JsMemoryLeakSignalResult["level"] =
    score >= 5 ? "high" : score >= 3 ? "medium" : score >= 1 ? "low" : "none";

  const effectiveConfidenceScore = options.scoped ? confidenceScore : Math.min(confidenceScore, 1);
  const confidence: JsMemoryLeakSignalResult["confidence"] =
    effectiveConfidenceScore >= 4 ? "high" : effectiveConfidenceScore >= 2 ? "medium" : "low";

  if (evidence.length === 0) {
    evidence.push("No strong retained-growth pattern detected in this window.");
  }

  return {
    suspicionScore: score,
    level,
    confidence,
    sampleCount,
    scope,
    windowStartSampleId,
    windowEndSampleId,
    evidence,
    qualityNotes,
    caveat:
      "This is a heuristic signal based on heap usage checkpoints, not proof of a memory leak. Use heap snapshots for confirmation.",
  };
}
