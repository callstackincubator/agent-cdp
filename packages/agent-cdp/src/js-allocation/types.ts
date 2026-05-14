import type { JsSourceMapsResult, SourceMapsInfo, SymbolicationStatus } from "../js-profiler/types.js";

export interface CdpSamplingCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface CdpSamplingHeapProfileNode {
  callFrame: CdpSamplingCallFrame;
  selfSize: number;
  id: number;
  children?: CdpSamplingHeapProfileNode[];
}

export interface CdpSamplingHeapProfileSample {
  size: number;
  nodeId: number;
  ordinal: number;
}

export interface CdpSamplingHeapProfile {
  head: CdpSamplingHeapProfileNode;
  samples?: CdpSamplingHeapProfileSample[];
}

export interface JsAllocationFrame {
  frameId: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  moduleName: string;
  isRuntime: boolean;
  isNative: boolean;
  symbolicationStatus: SymbolicationStatus;
  bundleUrl?: string;
  bundleLineNumber?: number;
  bundleColumnNumber?: number;
}

export interface JsAllocationHotspot {
  hotspotId: string;
  frameId: string;
  selfBytes: number;
  totalBytes: number;
  selfSampleCount: number;
  totalSampleCount: number;
  selfPercent: number;
  totalPercent: number;
}

export interface JsAllocationModuleRollup {
  moduleName: string;
  selfBytes: number;
  totalBytes: number;
  selfSampleCount: number;
  totalSampleCount: number;
  selfPercent: number;
  totalPercent: number;
}

export interface JsAllocationBucket {
  bucketId: string;
  startOrdinal: number;
  endOrdinal: number;
  startPercent: number;
  endPercent: number;
  sampleCount: number;
  bytes: number;
  deltaBytesFromPrev: number | null;
  topHotspotIds: string[];
}

export interface JsAllocationSession {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  samplingIntervalBytes: number | undefined;
  stackDepth: number | undefined;
  includeObjectsCollectedByMajorGC: boolean;
  includeObjectsCollectedByMinorGC: boolean;
  frames: Map<string, JsAllocationFrame>;
  hotspots: JsAllocationHotspot[];
  hotspotsById: Map<string, JsAllocationHotspot>;
  modules: JsAllocationModuleRollup[];
  buckets: JsAllocationBucket[];
  sampleOrdinals: number[];
  sampleHotspotIds: (string | null)[];
  rawProfile: CdpSamplingHeapProfile;
  totalBytes: number;
  sampleCount: number;
  top1SharePercent: number;
  top5SharePercent: number;
  lateAllocationSharePercent: number;
  largestBucketBytes: number;
  sourceMaps: SourceMapsInfo;
}

export interface JsAllocationStatusResult {
  active: boolean;
  activeName: string | null;
  elapsedMs: number | null;
  sessionCount: number;
}

export interface JsAllocationSessionListEntry {
  sessionId: string;
  name: string;
  durationMs: number;
  sampleCount: number;
  totalBytes: number;
  startedAt: number;
}

export interface JsAllocationSummaryResult {
  session: {
    sessionId: string;
    name: string;
    durationMs: number;
    sampleCount: number;
    totalBytes: number;
    samplingIntervalBytes: number | undefined;
    stackDepth: number | undefined;
    includeObjectsCollectedByMajorGC: boolean;
    includeObjectsCollectedByMinorGC: boolean;
    symbolicationState: SourceMapsInfo["state"];
  };
  sourceMaps: {
    state: SourceMapsInfo["state"];
    bundleCount: number;
    resolvedCount: number;
    symbolicatedFramePercent: number;
    notes: string[];
  };
  topAllocators: Array<{
    hotspotId: string;
    functionName: string;
    module: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    symbolicationStatus: SymbolicationStatus;
    selfBytes: number;
    selfPercent: number;
    sampleCount: number;
  }>;
  topModules: Array<{
    module: string;
    selfBytes: number;
    selfPercent: number;
    sampleCount: number;
  }>;
  bucketTrend: {
    bucketCount: number;
    growingBucketTransitions: number;
    largestJump: number;
    lateAllocationSharePercent: number;
  };
  concentration: {
    top1SharePercent: number;
    top5SharePercent: number;
  };
  evidence: string[];
  caveats: string[];
}

export interface JsAllocationHotspotsResult {
  sessionId: string;
  total: number;
  offset: number;
  sourceMaps: {
    state: SourceMapsInfo["state"];
    symbolicatedFramePercent: number;
  };
  items: Array<{
    hotspotId: string;
    functionName: string;
    module: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    symbolicationStatus: SymbolicationStatus;
    selfBytes: number;
    totalBytes: number;
    selfPercent: number;
    totalPercent: number;
    sampleCount: number;
  }>;
}

export interface JsAllocationBucketedResult {
  sessionId: string;
  bucketCount: number;
  totalBytes: number;
  buckets: JsAllocationBucket[];
  caveats: string[];
}

export interface JsAllocationLeakSignalResult {
  sessionId: string;
  suspicionScore: number;
  level: "none" | "low" | "medium" | "high";
  evidence: string[];
  caveat: string;
}

export interface JsAllocationExportResult {
  sessionId: string;
  name: string;
  filePath: string;
  bytesWritten: number;
}

export type JsAllocationSourceMapsResult = JsSourceMapsResult;
