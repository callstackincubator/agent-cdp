import type { JsSourceMapsResult, SourceMapsInfo, SymbolicationStatus } from "../js-profiler/types.js";

export interface JsAllocationTimelineBucket {
  bucketId: string;
  startPercent: number;
  endPercent: number;
  objectCount: number;
  sizeBytes: number;
  objectDeltaFromPrev: number | null;
  sizeDeltaFromPrev: number | null;
  lastSeenObjectId: number;
}

export interface JsAllocationTimelineTrace {
  traceId: number;
  functionName: string;
  scriptName: string;
  scriptId: number;
  line: number;
  column: number;
  symbolicationStatus: SymbolicationStatus;
  bundleScriptName?: string;
  bundleLine?: number;
  bundleColumn?: number;
  liveCount: number;
  liveSize: number;
  totalCount: number;
  totalSize: number;
}

export interface JsAllocationTimelineSession {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  snapshotId: string;
  snapshotFilePath: string;
  rawSnapshotJson: string;
  chunkCount: number;
  peakTrackedObjects: number;
  peakTrackedSizeBytes: number;
  buckets: JsAllocationTimelineBucket[];
  topTraces: JsAllocationTimelineTrace[];
  lateTrackedSizeSharePercent: number;
  sourceMaps: SourceMapsInfo;
}

export interface JsAllocationTimelineStatusResult {
  active: boolean;
  activeName: string | null;
  elapsedMs: number | null;
  sessionCount: number;
}

export interface JsAllocationTimelineSessionListEntry {
  sessionId: string;
  name: string;
  durationMs: number;
  bucketCount: number;
  peakTrackedSizeBytes: number;
  snapshotId: string;
  startedAt: number;
}

export interface JsAllocationTimelineSummaryResult {
  session: {
    sessionId: string;
    name: string;
    durationMs: number;
    bucketCount: number;
    snapshotId: string;
    peakTrackedObjects: number;
    peakTrackedSizeBytes: number;
    lateTrackedSizeSharePercent: number;
    symbolicationState: SourceMapsInfo["state"];
  };
  sourceMaps: {
    state: SourceMapsInfo["state"];
    bundleCount: number;
    resolvedCount: number;
    symbolicatedFramePercent: number;
    notes: string[];
  };
  topTraces: JsAllocationTimelineTrace[];
  bucketTrend: {
    growingBucketTransitions: number;
    largestTrackedSizeJump: number;
    finalTrackedSizeBytes: number;
  };
  evidence: string[];
  caveats: string[];
}

export interface JsAllocationTimelineBucketsResult {
  sessionId: string;
  snapshotId: string;
  buckets: JsAllocationTimelineBucket[];
  caveats: string[];
}

export interface JsAllocationTimelineHotspotsResult {
  sessionId: string;
  snapshotId: string;
  total: number;
  offset: number;
  sourceMaps: {
    state: SourceMapsInfo["state"];
    symbolicatedFramePercent: number;
  };
  items: JsAllocationTimelineTrace[];
}

export interface JsAllocationTimelineLeakSignalResult {
  sessionId: string;
  suspicionScore: number;
  level: "none" | "low" | "medium" | "high";
  evidence: string[];
  caveat: string;
}

export interface JsAllocationTimelineExportResult {
  sessionId: string;
  snapshotId: string;
  name: string;
  filePath: string;
  bytesWritten: number;
}

export type JsAllocationTimelineSourceMapsResult = JsSourceMapsResult;
