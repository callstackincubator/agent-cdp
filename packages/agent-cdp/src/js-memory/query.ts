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

export function queryLeakSignal(samples: JsMemorySample[]): JsMemoryLeakSignalResult {
  if (samples.length < 2) {
    return {
      suspicionScore: 0,
      level: "none",
      evidence: ["Not enough samples to compute a trend (need at least 2)."],
      caveat: "This is a heuristic signal, not proof of a leak.",
    };
  }

  const evidence: string[] = [];
  let score = 0;

  const { slope, monotoneUp } = computeSlope(samples);

  if (monotoneUp) {
    score += 3;
    evidence.push(`usedJSHeapSize increased monotonically across all ${samples.length} samples.`);
  } else if (slope === "increasing") {
    score += 2;
    evidence.push("usedJSHeapSize shows a predominantly increasing trend.");
  }

  const first = samples[0].usedJSHeapSize;
  const last = samples.at(-1)!.usedJSHeapSize;
  const growthMb = (last - first) / (1024 * 1024);
  const growthPct = first > 0 ? ((last - first) / first) * 100 : 0;

  if (growthMb > 50) {
    score += 3;
    evidence.push(`Total growth exceeds 50 MB (${growthMb.toFixed(1)} MB).`);
  } else if (growthMb > 10) {
    score += 2;
    evidence.push(`Total growth exceeds 10 MB (${growthMb.toFixed(1)} MB).`);
  } else if (growthPct > 50) {
    score += 1;
    evidence.push(`Total growth is ${growthPct.toFixed(1)}% of the initial heap size.`);
  }

  const gcSamples = samples.filter((s) => s.collectGarbageRequested);
  if (gcSamples.length > 0) {
    const gcIndices = gcSamples.map((s) => samples.indexOf(s));
    const poorRecovery = gcIndices.some((idx) => {
      if (idx === 0) return false;
      const beforeGc = samples[idx - 1].usedJSHeapSize;
      const afterGc = samples[idx].usedJSHeapSize;
      return afterGc > beforeGc * 0.9;
    });
    if (poorRecovery) {
      score += 2;
      evidence.push("Heap did not recover significantly after GC-assisted samples.");
    }
  }

  const level: JsMemoryLeakSignalResult["level"] =
    score >= 5 ? "high" : score >= 3 ? "medium" : score >= 1 ? "low" : "none";

  if (evidence.length === 0) {
    evidence.push("No significant growth pattern detected.");
  }

  return {
    suspicionScore: score,
    level,
    evidence,
    caveat:
      "This is a heuristic signal based on heap usage trends, not proof of a memory leak. Use heap snapshots for confirmation.",
  };
}
