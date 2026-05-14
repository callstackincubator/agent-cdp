export interface JsMemorySample {
  sampleId: string;
  label?: string;
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  source: string;
  collectGarbageRequested: boolean;
}

export interface JsMemorySampleResult {
  sampleId: string;
  label?: string;
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  source: string;
  collectGarbageRequested: boolean;
  caveats: string[];
}

export interface JsMemoryListResult {
  total: number;
  offset: number;
  items: JsMemorySampleResult[];
}

export interface JsMemorySummaryResult {
  latest: JsMemorySampleResult | null;
  sampleCount: number;
  minUsed: number;
  maxUsed: number;
  avgUsed: number;
  growthOverSession: number;
  growthPercent: number;
  suspicionNote: string | null;
  caveats: string[];
}

export interface JsMemoryDiffResult {
  baseSampleId: string;
  compareSampleId: string;
  beforeUsed: number;
  afterUsed: number;
  usedDelta: number;
  usedDeltaPercent: number;
  beforeTotal: number;
  afterTotal: number;
  totalDelta: number;
  caveats: string[];
}

export interface JsMemoryTrendCheckpoint {
  sampleId: string;
  label?: string;
  timestamp: number;
  usedJSHeapSize: number;
  deltaFromPrev: number | null;
}

export interface JsMemoryTrendResult {
  checkpoints: JsMemoryTrendCheckpoint[];
  slope: "increasing" | "decreasing" | "stable" | "oscillating";
  totalGrowth: number;
  totalGrowthPercent: number;
  largestJump: number;
  caveats: string[];
}

export interface JsMemoryLeakSignalResult {
  suspicionScore: number;
  level: "none" | "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  sampleCount: number;
  scope: "full-history" | "bounded";
  windowStartSampleId: string | null;
  windowEndSampleId: string | null;
  evidence: string[];
  qualityNotes: string[];
  caveat: string;
}
