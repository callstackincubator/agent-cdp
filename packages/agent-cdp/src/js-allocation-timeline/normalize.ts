import type { SourceMapState, SourceMapsInfo, SymbolicationStatus } from "../js-profiler/types.js";
import type { SymbolicationResult } from "../source-maps.js";
import { isHttpUrl } from "../source-maps.js";
import type { AnalyzedSnapshot, RawHeapSnapshotJson } from "../heap-snapshot/types.js";
import type { JsAllocationTimelineBucket, JsAllocationTimelineSession, JsAllocationTimelineTrace } from "./types.js";

const BUCKET_COUNT = 5;

interface HeapStatsSample {
  timestamp: number;
  lastSeenObjectId: number;
  totalObjectCount: number;
  totalSizeBytes: number;
}

interface NormalizeMeta {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  rawSnapshotJson: string;
  chunkCount: number;
  heapSamples: HeapStatsSample[];
  snapshot: AnalyzedSnapshot;
  sourceMaps?: SymbolicationResult;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface TraceFunctionInfo {
  functionName: string;
  scriptName: string;
  scriptId: number;
  line: number;
  column: number;
}

interface TraceTreeNode {
  id: number;
  functionInfoIndex: number;
  count: number;
  size: number;
  children: TraceTreeNode[];
}

function parseTraceFunctions(raw: RawHeapSnapshotJson): TraceFunctionInfo[] {
  const fields = raw.snapshot.meta.trace_function_info_fields ?? [];
  const data = raw.trace_function_infos ?? [];
  if (fields.length === 0 || data.length === 0) return [];

  const fieldCount = fields.length;
  const nameIdx = fields.indexOf("name");
  const scriptNameIdx = fields.indexOf("script_name");
  const scriptIdIdx = fields.indexOf("script_id");
  const lineIdx = fields.indexOf("line");
  const columnIdx = fields.indexOf("column");

  const infos: TraceFunctionInfo[] = [];
  for (let i = 0; i + fieldCount - 1 < data.length; i += fieldCount) {
    infos.push({
      functionName: raw.strings[data[i + nameIdx]] ?? "(anonymous)",
      scriptName: raw.strings[data[i + scriptNameIdx]] ?? "",
      scriptId: data[i + scriptIdIdx] ?? 0,
      line: data[i + lineIdx] ?? 0,
      column: data[i + columnIdx] ?? 0,
    });
  }
  return infos;
}

function parseTraceTree(raw: RawHeapSnapshotJson): TraceTreeNode | null {
  const fields = raw.snapshot.meta.trace_node_fields ?? [];
  const traceTree = raw.trace_tree;
  if (!Array.isArray(traceTree) || fields.length === 0) return null;

  const idIdx = fields.indexOf("id");
  const functionInfoIndexIdx = fields.indexOf("function_info_index");
  const countIdx = fields.indexOf("count");
  const sizeIdx = fields.indexOf("size");
  const childrenIdx = fields.indexOf("children");
  const fieldCount = fields.length;

  function parseNode(nodeData: unknown[]): TraceTreeNode | null {
    if (nodeData.length < fieldCount) return null;
    const childrenRaw = Array.isArray(nodeData[childrenIdx]) ? nodeData[childrenIdx] : [];
    const children: TraceTreeNode[] = [];
    for (let i = 0; i + fieldCount - 1 < childrenRaw.length; i += fieldCount) {
      const childNode = parseNode(childrenRaw.slice(i, i + fieldCount));
      if (childNode) children.push(childNode);
    }

    return {
      id: Number(nodeData[idIdx] ?? 0),
      functionInfoIndex: Number(nodeData[functionInfoIndexIdx] ?? 0),
      count: Number(nodeData[countIdx] ?? 0),
      size: Number(nodeData[sizeIdx] ?? 0),
      children,
    };
  }

  return parseNode(traceTree as unknown[]);
}

function collectNodeLiveStats(snapshot: AnalyzedSnapshot): Map<number, { liveCount: number; liveSize: number }> {
  const stats = new Map<number, { liveCount: number; liveSize: number }>();
  const traceNodeIdx = snapshot.parsed.nodeTraceNodeIdIdx;
  if (traceNodeIdx < 0) return stats;

  for (let nodeIndex = 0; nodeIndex < snapshot.parsed.nodeCount; nodeIndex++) {
    const traceId = snapshot.parsed.nodes[nodeIndex * snapshot.parsed.nodeFieldCount + traceNodeIdx];
    if (!traceId) continue;
    const existing = stats.get(traceId) ?? { liveCount: 0, liveSize: 0 };
    existing.liveCount += 1;
    existing.liveSize += snapshot.retainedSizes[nodeIndex];
    stats.set(traceId, existing);
  }

  return stats;
}

function flattenTraceTree(
  root: TraceTreeNode | null,
  infos: TraceFunctionInfo[],
  liveStats: Map<number, { liveCount: number; liveSize: number }>,
  sourceMaps?: SymbolicationResult,
): JsAllocationTimelineTrace[] {
  if (!root) return [];

  const traces: JsAllocationTimelineTrace[] = [];

  function visit(node: TraceTreeNode): void {
    const info = infos[node.functionInfoIndex] ?? {
      functionName: "(unknown)",
      scriptName: "",
      scriptId: 0,
      line: 0,
      column: 0,
    };
    const live = liveStats.get(node.id) ?? { liveCount: 0, liveSize: 0 };
    const orig = sourceMaps?.getOriginalPosition(info.scriptName, info.line, info.column) ?? null;
    const symbolicationStatus: SymbolicationStatus = orig
      ? "symbolicated"
      : sourceMaps?.isBundleUrl(info.scriptName)
        ? "bundle-level"
        : isHttpUrl(info.scriptName)
          ? "bundle-level"
          : "not-applicable";
    if (node.id !== 0 && (node.size > 0 || live.liveSize > 0)) {
      traces.push({
        traceId: node.id,
        functionName: orig?.name || info.functionName,
        scriptName: orig?.source ?? info.scriptName,
        scriptId: info.scriptId,
        line: orig?.line ?? info.line,
        column: orig?.column ?? info.column,
        symbolicationStatus,
        bundleScriptName: orig ? info.scriptName : undefined,
        bundleLine: orig ? info.line : undefined,
        bundleColumn: orig ? info.column : undefined,
        liveCount: live.liveCount,
        liveSize: Math.round(live.liveSize),
        totalCount: node.count,
        totalSize: node.size,
      });
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return traces.sort((a, b) => b.liveSize - a.liveSize || b.totalSize - a.totalSize).slice(0, 20);
}

function buildBuckets(samples: HeapStatsSample[]): JsAllocationTimelineBucket[] {
  if (samples.length === 0) return [];
  const bucketCount = Math.min(BUCKET_COUNT, samples.length);
  const buckets: JsAllocationTimelineBucket[] = [];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const start = Math.floor((bucketIndex * samples.length) / bucketCount);
    const end = Math.floor(((bucketIndex + 1) * samples.length) / bucketCount) - 1;
    const bucketSamples = samples.slice(start, end + 1);
    const last = bucketSamples.at(-1);
    if (!last) continue;
    const prev = buckets.at(-1);
    buckets.push({
      bucketId: `b${bucketIndex + 1}`,
      startPercent: round1((bucketIndex / bucketCount) * 100),
      endPercent: round1(((bucketIndex + 1) / bucketCount) * 100),
      objectCount: last.totalObjectCount,
      sizeBytes: last.totalSizeBytes,
      objectDeltaFromPrev: prev ? last.totalObjectCount - prev.objectCount : null,
      sizeDeltaFromPrev: prev ? last.totalSizeBytes - prev.sizeBytes : null,
      lastSeenObjectId: last.lastSeenObjectId,
    });
  }

  return buckets;
}

export function normalizeAllocationTimeline(rawSnapshot: RawHeapSnapshotJson, meta: NormalizeMeta): JsAllocationTimelineSession {
  const traceInfos = parseTraceFunctions(rawSnapshot);
  const traceTree = parseTraceTree(rawSnapshot);
  const liveStats = collectNodeLiveStats(meta.snapshot);
  const topTraces = flattenTraceTree(traceTree, traceInfos, liveStats, meta.sourceMaps);
  const buckets = buildBuckets(meta.heapSamples);
  const peakTrackedObjects = buckets.reduce((max, bucket) => Math.max(max, bucket.objectCount), 0);
  const peakTrackedSizeBytes = buckets.reduce((max, bucket) => Math.max(max, bucket.sizeBytes), 0);
  const lastBucket = buckets.at(-1);
  const lateTrackedSizeSharePercent = lastBucket && peakTrackedSizeBytes > 0 ? round1((lastBucket.sizeBytes / peakTrackedSizeBytes) * 100) : 0;
  const sourceMaps = buildSourceMapsInfo(meta.sourceMaps);

  return {
    sessionId: meta.sessionId,
    name: meta.name,
    startedAt: meta.startedAt,
    stoppedAt: meta.stoppedAt,
    durationMs: meta.stoppedAt - meta.startedAt,
    snapshotId: meta.snapshot.snapshotId,
    snapshotFilePath: meta.snapshot.filePath,
    rawSnapshotJson: meta.rawSnapshotJson,
    chunkCount: meta.chunkCount,
    peakTrackedObjects,
    peakTrackedSizeBytes,
    buckets,
    topTraces,
    lateTrackedSizeSharePercent,
    sourceMaps,
  };
}

function buildSourceMapsInfo(sym: SymbolicationResult | undefined): SourceMapsInfo {
  if (!sym || sym.bundleUrls.length === 0) {
    return {
      state: "none",
      bundleUrls: [],
      resolvedSourceMapUrls: [],
      symbolicatedFrameCount: 0,
      totalMappableFrameCount: 0,
      failures: sym?.failures ?? [],
    };
  }

  const { bundleUrls, resolvedSourceMapUrls, failures, totalMappableFrames, symbolicatedCount } = sym;

  let state: SourceMapState;
  if (failures.length > 0 && resolvedSourceMapUrls.length === 0) {
    state = "failed";
  } else if (totalMappableFrames > 0 && symbolicatedCount === totalMappableFrames) {
    state = "full";
  } else if (symbolicatedCount > 0) {
    state = "partial";
  } else {
    state = "failed";
  }

  return {
    state,
    bundleUrls,
    resolvedSourceMapUrls,
    symbolicatedFrameCount: symbolicatedCount,
    totalMappableFrameCount: totalMappableFrames,
    failures,
  };
}
