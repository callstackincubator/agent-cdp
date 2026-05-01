// CDP raw profile types
export interface CdpCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface CdpProfileNode {
  id: number;
  callFrame: CdpCallFrame;
  hitCount?: number;
  children?: number[];
}

export interface CdpProfile {
  nodes: CdpProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

// Normalized session model

export interface JsFrame {
  frameId: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  moduleName: string;
  isNative: boolean;
  isRuntime: boolean;
  isAnonymous: boolean;
}

export interface JsHotspot {
  hotspotId: string;
  frameId: string;
  selfSampleCount: number;
  totalSampleCount: number;
  selfTimeMs: number;
  totalTimeMs: number;
  selfPercent: number;
  totalPercent: number;
}

export interface JsModuleRollup {
  moduleName: string;
  selfSampleCount: number;
  totalSampleCount: number;
  selfTimeMs: number;
  totalTimeMs: number;
  selfPercent: number;
  totalPercent: number;
}

export interface JsStackSignature {
  stackId: string;
  frameIds: string[];
  frames: string[];
  sampleCount: number;
  timeMs: number;
  percent: number;
}

export interface JsTimeBucket {
  startMs: number;
  endMs: number;
  sampleCount: number;
  topHotspotIds: string[];
}

export interface JsProfileSession {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  sampleCount: number;
  samplingIntervalUs: number | undefined;
  frames: Map<string, JsFrame>;
  hotspots: JsHotspot[];
  hotspotsById: Map<string, JsHotspot>;
  modules: JsModuleRollup[];
  stacks: JsStackSignature[];
  timeBuckets: JsTimeBucket[];
  sampleTimestampsMs: number[];
  sampleHotspotIds: (string | null)[];
  rawProfile: unknown;
}

// IPC result shapes

export interface JsProfileStatusResult {
  active: boolean;
  activeName: string | null;
  elapsedMs: number | null;
  sessionCount: number;
}

export interface JsSessionListEntry {
  sessionId: string;
  name: string;
  durationMs: number;
  sampleCount: number;
  startedAt: number;
}

export interface JsProfileSummary {
  session: {
    sessionId: string;
    name: string;
    durationMs: number;
    sampleCount: number;
    samplingIntervalUs: number | undefined;
    symbolicationState: "raw";
  };
  topHotspots: Array<{
    hotspotId: string;
    functionName: string;
    module: string;
    selfTimeMs: number;
    totalTimeMs: number;
    selfPercent: number;
    sampleCount: number;
  }>;
  topModules: Array<{
    module: string;
    selfTimeMs: number;
    selfPercent: number;
  }>;
  topStacks: Array<{
    stackId: string;
    percent: number;
    frames: string[];
  }>;
  caveats: string[];
}

export interface JsHotspotsItem {
  hotspotId: string;
  functionName: string;
  module: string;
  selfTimeMs: number;
  totalTimeMs: number;
  selfPercent: number;
  totalPercent: number;
  sampleCount: number;
}

export interface JsHotspotsResult {
  sessionId: string;
  total: number;
  offset: number;
  items: JsHotspotsItem[];
}

export interface JsHotspotDetailResult {
  hotspot: {
    hotspotId: string;
    selfTimeMs: number;
    totalTimeMs: number;
    selfPercent: number;
    totalPercent: number;
    selfSampleCount: number;
    totalSampleCount: number;
  };
  frame: {
    frameId: string;
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    moduleName: string;
    isNative: boolean;
    isRuntime: boolean;
  };
  representativeStacks: Array<{
    stackId: string;
    percent: number;
    frames: string[];
  }>;
  activeTimeBuckets: Array<{
    startMs: number;
    endMs: number;
    sampleCount: number;
  }>;
  caveats: string[];
}

export interface JsModulesResult {
  sessionId: string;
  total: number;
  offset: number;
  items: JsModuleRollup[];
}

export interface JsStacksResult {
  sessionId: string;
  total: number;
  offset: number;
  items: Array<{
    stackId: string;
    percent: number;
    timeMs: number;
    sampleCount: number;
    frames: string[];
  }>;
}

export interface JsSliceResult {
  sessionId: string;
  requestedRange: { startMs: number; endMs: number };
  sampleCount: number;
  coveragePercent: number;
  topHotspots: Array<{
    hotspotId: string;
    functionName: string;
    module: string;
    selfSampleCount: number;
    selfPercent: number;
  }>;
  caveats: string[];
}

export interface JsDiffEntry {
  functionName: string;
  module: string;
  baseSelfMs: number;
  compareSelfMs: number;
  deltaSelfMs: number;
  deltaSelfPct: number | null;
  basePercent: number;
  comparePercent: number;
}

export interface JsDiffResult {
  base: { sessionId: string; name: string; durationMs: number; sampleCount: number };
  compare: { sessionId: string; name: string; durationMs: number; sampleCount: number };
  regressed: JsDiffEntry[];
  improved: JsDiffEntry[];
  caveats: string[];
}
