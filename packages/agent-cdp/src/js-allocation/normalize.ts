import type {
  SourceMapState,
  SourceMapsInfo,
  SymbolicationStatus,
} from "../js-profiler/types.js";
import type { SymbolicationResult } from "../source-maps.js";
import { isHttpUrl } from "../source-maps.js";
import type {
  CdpSamplingHeapProfile,
  CdpSamplingHeapProfileNode,
  CdpSamplingHeapProfileSample,
  JsAllocationBucket,
  JsAllocationFrame,
  JsAllocationHotspot,
  JsAllocationModuleRollup,
  JsAllocationSession,
} from "./types.js";

const BUCKET_COUNT = 5;
const NOISE_NAMES = new Set(["(root)", "(program)", "(garbage collector)", "(idle)"]);

interface NormalizeMeta {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  samplingIntervalBytes: number | undefined;
  stackDepth: number | undefined;
  includeObjectsCollectedByMajorGC: boolean;
  includeObjectsCollectedByMinorGC: boolean;
  sourceMaps?: SymbolicationResult;
}

interface FlatNode {
  id: number;
  node: CdpSamplingHeapProfileNode;
  parentId?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function deriveModuleName(url: string): string {
  if (!url) return "(anonymous)";
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    return parts.at(-1) || parsed.hostname || url;
  } catch {
    const parts = url.split(/[/\\]/);
    return parts.at(-1) || url;
  }
}

function flattenTree(head: CdpSamplingHeapProfileNode): FlatNode[] {
  const nodes: FlatNode[] = [];
  const stack: Array<{ node: CdpSamplingHeapProfileNode; parentId?: number }> = [{ node: head }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    nodes.push({ id: current.node.id, node: current.node, parentId: current.parentId });
    for (const child of current.node.children ?? []) {
      stack.push({ node: child, parentId: current.node.id });
    }
  }

  return nodes;
}

export function normalizeAllocationProfile(rawProfile: CdpSamplingHeapProfile, meta: NormalizeMeta): JsAllocationSession {
  const samples = [...(rawProfile.samples ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const flatNodes = flattenTree(rawProfile.head);
  const nodeById = new Map<number, FlatNode>();
  for (const entry of flatNodes) nodeById.set(entry.id, entry);

  const childrenById = new Map<number, number[]>();
  for (const entry of flatNodes) {
    if (entry.parentId === undefined) continue;
    const children = childrenById.get(entry.parentId) ?? [];
    children.push(entry.id);
    childrenById.set(entry.parentId, children);
  }

  const frameByKey = new Map<string, JsAllocationFrame>();
  const frameById = new Map<string, JsAllocationFrame>();
  let frameCounter = 0;

  function frameKey(node: CdpSamplingHeapProfileNode): string {
    const frame = node.callFrame;
    return `${frame.functionName}|${frame.url}|${frame.lineNumber}|${frame.columnNumber}`;
  }

  function getOrCreateFrame(node: CdpSamplingHeapProfileNode): JsAllocationFrame {
    const key = frameKey(node);
    const existing = frameByKey.get(key);
    if (existing) return existing;

    const functionName = node.callFrame.functionName || "(anonymous)";
    const orig = meta.sourceMaps?.getOriginalPosition(node.callFrame.url, node.callFrame.lineNumber, node.callFrame.columnNumber) ?? null;
    const symbolicationStatus: SymbolicationStatus = orig
      ? "symbolicated"
      : meta.sourceMaps?.isBundleUrl(node.callFrame.url)
        ? "bundle-level"
        : isHttpUrl(node.callFrame.url)
          ? "bundle-level"
          : "not-applicable";
    const frame: JsAllocationFrame = {
      frameId: `af_${++frameCounter}`,
      functionName: orig?.name || functionName,
      url: orig?.source ?? node.callFrame.url,
      lineNumber: orig?.line ?? node.callFrame.lineNumber,
      columnNumber: orig?.column ?? node.callFrame.columnNumber,
      moduleName: deriveModuleName(orig?.source ?? node.callFrame.url),
      isRuntime: NOISE_NAMES.has(functionName) || (!node.callFrame.url && functionName.startsWith("(")),
      isNative: node.callFrame.url.startsWith("native "),
      symbolicationStatus,
    };
    if (orig) {
      frame.bundleUrl = node.callFrame.url;
      frame.bundleLineNumber = node.callFrame.lineNumber;
      frame.bundleColumnNumber = node.callFrame.columnNumber;
    }
    frameByKey.set(key, frame);
    frameById.set(frame.frameId, frame);
    return frame;
  }

  for (const entry of flatNodes) {
    getOrCreateFrame(entry.node);
  }

  const selfBytesByKey = new Map<string, number>();
  const selfSamplesByKey = new Map<string, number>();
  const sampleCountByNodeId = new Map<number, number>();

  for (const sample of samples) {
    sampleCountByNodeId.set(sample.nodeId, (sampleCountByNodeId.get(sample.nodeId) ?? 0) + 1);
    const flatNode = nodeById.get(sample.nodeId);
    if (!flatNode) continue;
    const key = frameKey(flatNode.node);
    selfBytesByKey.set(key, (selfBytesByKey.get(key) ?? 0) + sample.size);
    selfSamplesByKey.set(key, (selfSamplesByKey.get(key) ?? 0) + 1);
  }

  const totalsByNodeId = new Map<number, { totalBytes: number; totalSampleCount: number }>();

  function computeTotals(nodeId: number): { totalBytes: number; totalSampleCount: number } {
    const cached = totalsByNodeId.get(nodeId);
    if (cached) return cached;

    let totalBytes = 0;
    let totalSampleCount = sampleCountByNodeId.get(nodeId) ?? 0;
    for (const sample of samples) {
      if (sample.nodeId === nodeId) totalBytes += sample.size;
    }

    for (const childId of childrenById.get(nodeId) ?? []) {
      const childTotals = computeTotals(childId);
      totalBytes += childTotals.totalBytes;
      totalSampleCount += childTotals.totalSampleCount;
    }

    const result = { totalBytes, totalSampleCount };
    totalsByNodeId.set(nodeId, result);
    return result;
  }

  for (const entry of flatNodes) {
    computeTotals(entry.id);
  }

  const totalBytes = samples.reduce((sum, sample) => sum + sample.size, 0);
  const sampleCount = samples.length;

  const hotspotCounterByKey = new Map<string, number>();
  const hotspots: JsAllocationHotspot[] = [];

  for (const [key, frame] of frameByKey.entries()) {
    if (NOISE_NAMES.has(frame.functionName)) continue;
    const selfBytes = selfBytesByKey.get(key) ?? 0;
    const selfSampleCount = selfSamplesByKey.get(key) ?? 0;
    if (selfBytes === 0 && selfSampleCount === 0) continue;

    let totalNodeBytes = 0;
    let totalNodeSamples = 0;
    for (const entry of flatNodes) {
      if (frameKey(entry.node) !== key) continue;
      const totals = totalsByNodeId.get(entry.id);
      totalNodeBytes += totals?.totalBytes ?? 0;
      totalNodeSamples += totals?.totalSampleCount ?? 0;
    }

    const hotspotId = `ah_${(hotspotCounterByKey.get(key) ?? 0) + 1}_${frame.frameId}`;
    hotspotCounterByKey.set(key, (hotspotCounterByKey.get(key) ?? 0) + 1);
    hotspots.push({
      hotspotId,
      frameId: frame.frameId,
      selfBytes,
      totalBytes: totalNodeBytes,
      selfSampleCount,
      totalSampleCount: totalNodeSamples,
      selfPercent: totalBytes > 0 ? round1((selfBytes / totalBytes) * 100) : 0,
      totalPercent: totalBytes > 0 ? round1((totalNodeBytes / totalBytes) * 100) : 0,
    });
  }

  hotspots.sort((a, b) => b.selfBytes - a.selfBytes);

  const hotspotsById = new Map<string, JsAllocationHotspot>();
  for (const hotspot of hotspots) hotspotsById.set(hotspot.hotspotId, hotspot);

  const hotspotIdByFrameId = new Map<string, string>();
  for (const hotspot of hotspots) {
    if (!hotspotIdByFrameId.has(hotspot.frameId)) {
      hotspotIdByFrameId.set(hotspot.frameId, hotspot.hotspotId);
    }
  }

  const moduleSelfBytes = new Map<string, number>();
  const moduleTotalBytes = new Map<string, number>();
  const moduleSelfSamples = new Map<string, number>();
  const moduleTotalSamples = new Map<string, number>();

  for (const hotspot of hotspots) {
    const frame = frameById.get(hotspot.frameId);
    if (!frame) continue;
    moduleSelfBytes.set(frame.moduleName, (moduleSelfBytes.get(frame.moduleName) ?? 0) + hotspot.selfBytes);
    moduleTotalBytes.set(frame.moduleName, (moduleTotalBytes.get(frame.moduleName) ?? 0) + hotspot.totalBytes);
    moduleSelfSamples.set(frame.moduleName, (moduleSelfSamples.get(frame.moduleName) ?? 0) + hotspot.selfSampleCount);
    moduleTotalSamples.set(frame.moduleName, (moduleTotalSamples.get(frame.moduleName) ?? 0) + hotspot.totalSampleCount);
  }

  const modules: JsAllocationModuleRollup[] = [...moduleSelfBytes.entries()]
    .map(([moduleName, selfBytes]) => ({
      moduleName,
      selfBytes,
      totalBytes: moduleTotalBytes.get(moduleName) ?? 0,
      selfSampleCount: moduleSelfSamples.get(moduleName) ?? 0,
      totalSampleCount: moduleTotalSamples.get(moduleName) ?? 0,
      selfPercent: totalBytes > 0 ? round1((selfBytes / totalBytes) * 100) : 0,
      totalPercent: totalBytes > 0 ? round1(((moduleTotalBytes.get(moduleName) ?? 0) / totalBytes) * 100) : 0,
    }))
    .sort((a, b) => b.selfBytes - a.selfBytes);

  const bucketCount = sampleCount === 0 ? 0 : Math.min(BUCKET_COUNT, sampleCount);
  const buckets: JsAllocationBucket[] = [];
  const sampleHotspotIds: (string | null)[] = [];
  const sampleOrdinals: number[] = [];

  if (bucketCount > 0) {
    const bucketAccs = Array.from({ length: bucketCount }, (_, index) => ({
      bucketId: `b${index + 1}`,
      startOrdinal: 0,
      endOrdinal: 0,
      sampleCount: 0,
      bytes: 0,
      hotspotBytes: new Map<string, number>(),
    }));

    for (let i = 0; i < samples.length; i++) {
      const sample: CdpSamplingHeapProfileSample = samples[i];
      const bucketIndex = Math.min(Math.floor((i / sampleCount) * bucketCount), bucketCount - 1);
      const bucket = bucketAccs[bucketIndex];
      if (bucket.sampleCount === 0) bucket.startOrdinal = sample.ordinal;
      bucket.endOrdinal = sample.ordinal;
      bucket.sampleCount += 1;
      bucket.bytes += sample.size;

      const flatNode = nodeById.get(sample.nodeId);
      let hotspotId: string | null = null;
      if (flatNode) {
        const frame = getOrCreateFrame(flatNode.node);
        hotspotId = hotspotIdByFrameId.get(frame.frameId) ?? null;
        if (hotspotId) {
          bucket.hotspotBytes.set(hotspotId, (bucket.hotspotBytes.get(hotspotId) ?? 0) + sample.size);
        }
      }

      sampleHotspotIds.push(hotspotId);
      sampleOrdinals.push(sample.ordinal);
    }

    for (let i = 0; i < bucketAccs.length; i++) {
      const bucket = bucketAccs[i];
      const prevBytes = i === 0 ? null : bucketAccs[i - 1].bytes;
      buckets.push({
        bucketId: bucket.bucketId,
        startOrdinal: bucket.startOrdinal,
        endOrdinal: bucket.endOrdinal,
        startPercent: round1((i / bucketCount) * 100),
        endPercent: round1(((i + 1) / bucketCount) * 100),
        sampleCount: bucket.sampleCount,
        bytes: bucket.bytes,
        deltaBytesFromPrev: prevBytes === null ? null : bucket.bytes - prevBytes,
        topHotspotIds: [...bucket.hotspotBytes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => id),
      });
    }
  }

  const top1SharePercent = hotspots[0] ? round1((hotspots[0].selfBytes / Math.max(1, totalBytes)) * 100) : 0;
  const top5Bytes = hotspots.slice(0, 5).reduce((sum, hotspot) => sum + hotspot.selfBytes, 0);
  const top5SharePercent = round1((top5Bytes / Math.max(1, totalBytes)) * 100);
  const lastBucket = buckets.at(-1);
  const lateAllocationSharePercent = lastBucket ? round1((lastBucket.bytes / Math.max(1, totalBytes)) * 100) : 0;
  const largestBucketBytes = buckets.reduce((max, bucket) => Math.max(max, bucket.bytes), 0);

  const frames = new Map<string, JsAllocationFrame>();
  for (const frame of frameById.values()) frames.set(frame.frameId, frame);

  const sourceMaps = buildSourceMapsInfo(meta.sourceMaps);

  return {
    sessionId: meta.sessionId,
    name: meta.name,
    startedAt: meta.startedAt,
    stoppedAt: meta.stoppedAt,
    durationMs: meta.stoppedAt - meta.startedAt,
    samplingIntervalBytes: meta.samplingIntervalBytes,
    stackDepth: meta.stackDepth,
    includeObjectsCollectedByMajorGC: meta.includeObjectsCollectedByMajorGC,
    includeObjectsCollectedByMinorGC: meta.includeObjectsCollectedByMinorGC,
    frames,
    hotspots,
    hotspotsById,
    modules,
    buckets,
    sampleOrdinals,
    sampleHotspotIds,
    rawProfile,
    totalBytes,
    sampleCount,
    top1SharePercent,
    top5SharePercent,
    lateAllocationSharePercent,
    largestBucketBytes,
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
