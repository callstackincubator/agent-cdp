import type { SymbolicationResult } from "./source-map.js";
import { isHttpUrl } from "./source-map.js";
import type {
  CdpProfile,
  JsFrame,
  JsHotspot,
  JsModuleRollup,
  JsProfileSession,
  JsStackSignature,
  JsTimeBucket,
  SourceMapState,
  SourceMapsInfo,
} from "./types.js";

const NOISE_NAMES = new Set([
  "(idle)",
  "(program)",
  "(garbage collector)",
  "(root)",
  "(optimized code)",
]);

const RUNTIME_NAMES = new Set(["(idle)", "(program)", "(garbage collector)", "(root)"]);

const BUCKET_COUNT = 10;
const MAX_STACK_FRAMES = 8;
const MAX_STACK_SIGNATURES = 50;

interface NormalizeMeta {
  sessionId: string;
  name: string;
  startedAt: number;
  stoppedAt: number;
  samplingIntervalUs: number | undefined;
}

export function normalizeProfile(
  rawProfile: unknown,
  meta: NormalizeMeta,
  sym?: SymbolicationResult,
): JsProfileSession {
  const profile = rawProfile as CdpProfile;
  const { nodes, samples = [], timeDeltas = [], startTime, endTime } = profile;

  const rawDurationMs = Math.max(0, (endTime - startTime) / 1000);
  const captureDurationMs = Math.max(0, meta.stoppedAt - meta.startedAt);
  const durationMs = captureDurationMs > 0 ? captureDurationMs : rawDurationMs;
  const rawSampleDeltasMs = timeDeltas.map((delta) => Math.max(0, delta / 1000));
  const totalRawSampleMs = rawSampleDeltasMs.reduce((sum, delta) => sum + delta, 0);
  const sampleTimeScale = totalRawSampleMs > 0 && durationMs > 0 ? durationMs / totalRawSampleMs : 1;

  const nodeById = new Map<number, CdpProfile["nodes"][0]>();
  for (const node of nodes) nodeById.set(node.id, node);

  const parentById = new Map<number, number>();
  for (const node of nodes) {
    for (const childId of node.children ?? []) parentById.set(childId, node.id);
  }

  // Per-sample timestamps relative to recording start (ms)
  const sampleTimestampsMs: number[] = [];
  let cumulativeMs = 0;
  for (let i = 0; i < samples.length; i++) {
    cumulativeMs += rawSampleDeltasMs[i] ?? 0;
    sampleTimestampsMs.push(cumulativeMs * sampleTimeScale);
  }

  const timePerSampleMs = samples.length > 0 ? durationMs / samples.length : 0;

  // Frame registry keyed by identity (original position when symbolicated, otherwise bundle)
  const frameByKey = new Map<string, JsFrame>();
  const rawNodeToFrameId = new Map<number, string>();
  let frameCounter = 0;

  function makeFrameKey(
    cf: { functionName: string; url: string; lineNumber: number; columnNumber: number },
    origSource?: string | null,
    origLine?: number | null,
    origCol?: number | null,
  ): string {
    if (origSource) {
      return `${cf.functionName}|${origSource}|${origLine ?? 0}|${origCol ?? 0}`;
    }
    return `${cf.functionName}|${cf.url}|${cf.lineNumber}|${cf.columnNumber}`;
  }

  function getOrCreateFrame(node: (typeof nodes)[0]): JsFrame {
    const cf = node.callFrame;
    const orig = sym?.getOriginalPosition(cf.url, cf.lineNumber, cf.columnNumber) ?? null;
    const key = makeFrameKey(cf, orig?.source, orig?.line, orig?.column);

    if (!frameByKey.has(key)) {
      const url = orig ? orig.source : cf.url;
      const line = orig ? orig.line : cf.lineNumber;
      const col = orig ? orig.column : cf.columnNumber;
      const funcName = orig?.name || cf.functionName || "(anonymous)";

      const isNative = cf.url.startsWith("native ");
      const isRuntime =
        RUNTIME_NAMES.has(cf.functionName) || (!cf.url && cf.functionName.startsWith("("));
      const isAnonymous = !funcName || funcName === "(anonymous)";

      const symbolicationStatus = orig
        ? "symbolicated"
        : sym?.isBundleUrl(cf.url)
          ? "bundle-level"
          : isHttpUrl(cf.url)
            ? "bundle-level"  // HTTP URL but no source map resolved for it
            : "not-applicable";

      const frame: JsFrame = {
        frameId: `f${++frameCounter}`,
        functionName: funcName,
        url,
        lineNumber: line,
        columnNumber: col,
        moduleName: deriveModuleName(url),
        isNative,
        isRuntime,
        isAnonymous,
        symbolicationStatus,
      };

      if (orig) {
        frame.bundleUrl = cf.url;
        frame.bundleLineNumber = cf.lineNumber;
        frame.bundleColumnNumber = cf.columnNumber;
      }

      frameByKey.set(key, frame);
    }

    return frameByKey.get(key)!;
  }

  for (const node of nodes) {
    const frame = getOrCreateFrame(node);
    rawNodeToFrameId.set(node.id, frame.frameId);
  }

  // Ancestor chain for a node: leaf first, root last
  function getAncestors(nodeId: number): number[] {
    const chain: number[] = [];
    let current: number | undefined = nodeId;
    const visited = new Set<number>();
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      current = parentById.get(current);
    }
    return chain;
  }

  // Node key: same as frame key, for self/total count tracking
  function nodeKey(node: (typeof nodes)[0]): string {
    const cf = node.callFrame;
    const orig = sym?.getOriginalPosition(cf.url, cf.lineNumber, cf.columnNumber) ?? null;
    return makeFrameKey(cf, orig?.source, orig?.line, orig?.column);
  }

  const selfCounts = new Map<string, number>();
  const totalCounts = new Map<string, number>();

  for (const sampleNodeId of samples) {
    const leafNode = nodeById.get(sampleNodeId);
    if (!leafNode) continue;

    const lk = nodeKey(leafNode);
    selfCounts.set(lk, (selfCounts.get(lk) ?? 0) + 1);

    const ancestors = getAncestors(sampleNodeId);
    const seen = new Set<string>();
    for (const nodeId of ancestors) {
      const n = nodeById.get(nodeId);
      if (!n) continue;
      const k = nodeKey(n);
      if (!seen.has(k)) {
        seen.add(k);
        totalCounts.set(k, (totalCounts.get(k) ?? 0) + 1);
      }
    }
  }

  // Build hotspots
  const hotspots: JsHotspot[] = [];
  const frameKeyToHotspotId = new Map<string, string>();
  let hotspotCounter = 0;

  for (const [key, frame] of frameByKey.entries()) {
    const selfCount = selfCounts.get(key) ?? 0;
    if (selfCount === 0) continue;
    if (NOISE_NAMES.has(frame.functionName)) continue;

    hotspotCounter++;
    const hotspotId = `h${hotspotCounter}`;
    const totalCount = totalCounts.get(key) ?? 0;

    hotspots.push({
      hotspotId,
      frameId: frame.frameId,
      selfSampleCount: selfCount,
      totalSampleCount: totalCount,
      selfTimeMs: selfCount * timePerSampleMs,
      totalTimeMs: totalCount * timePerSampleMs,
      selfPercent: samples.length > 0 ? (selfCount / samples.length) * 100 : 0,
      totalPercent: samples.length > 0 ? (totalCount / samples.length) * 100 : 0,
    });

    frameKeyToHotspotId.set(key, hotspotId);
  }

  hotspots.sort((a, b) => b.selfSampleCount - a.selfSampleCount);

  const hotspotsById = new Map<string, JsHotspot>();
  for (const h of hotspots) hotspotsById.set(h.hotspotId, h);

  // Module rollups
  const moduleSelf = new Map<string, number>();
  const moduleTotal = new Map<string, number>();

  for (const [key, frame] of frameByKey.entries()) {
    if (NOISE_NAMES.has(frame.functionName)) continue;
    const self = selfCounts.get(key) ?? 0;
    const total = totalCounts.get(key) ?? 0;
    if (self === 0 && total === 0) continue;
    const mod = frame.moduleName;
    moduleSelf.set(mod, (moduleSelf.get(mod) ?? 0) + self);
    moduleTotal.set(mod, (moduleTotal.get(mod) ?? 0) + total);
  }

  const modules: JsModuleRollup[] = [...moduleSelf.entries()].map(([mod, self]) => {
    const total = moduleTotal.get(mod) ?? 0;
    return {
      moduleName: mod,
      selfSampleCount: self,
      totalSampleCount: total,
      selfTimeMs: self * timePerSampleMs,
      totalTimeMs: total * timePerSampleMs,
      selfPercent: samples.length > 0 ? (self / samples.length) * 100 : 0,
      totalPercent: samples.length > 0 ? (total / samples.length) * 100 : 0,
    };
  });
  modules.sort((a, b) => b.selfSampleCount - a.selfSampleCount);

  // Stack signatures
  const sigByKey = new Map<string, { frameIds: string[]; frames: string[]; count: number; timeMs: number }>();

  for (let i = 0; i < samples.length; i++) {
    const ancestors = getAncestors(samples[i]);
    const frameIds: string[] = [];
    const frameNames: string[] = [];

    for (const nodeId of ancestors) {
      if (frameIds.length >= MAX_STACK_FRAMES) break;
      const n = nodeById.get(nodeId);
      if (!n) continue;
      const frame = frameByKey.get(nodeKey(n));
      if (!frame || frame.isRuntime || NOISE_NAMES.has(frame.functionName)) continue;
      frameIds.push(frame.frameId);
      frameNames.push(frame.functionName);
    }

    if (frameIds.length === 0) continue;

    const sigKey = frameIds.join(">>>");
    const timeDelta = (rawSampleDeltasMs[i] ?? 0) * sampleTimeScale;
    const existing = sigByKey.get(sigKey);
    if (existing) {
      existing.count++;
      existing.timeMs += timeDelta;
    } else {
      sigByKey.set(sigKey, { frameIds, frames: frameNames, count: 1, timeMs: timeDelta });
    }
  }

  let stackCounter = 0;
  const stacks: JsStackSignature[] = [...sigByKey.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_STACK_SIGNATURES)
    .map((sig) => ({
      stackId: `s${++stackCounter}`,
      frameIds: sig.frameIds,
      frames: sig.frames,
      sampleCount: sig.count,
      timeMs: sig.timeMs,
      percent: samples.length > 0 ? (sig.count / samples.length) * 100 : 0,
    }));

  // Time buckets
  const bucketWidthMs = durationMs > 0 ? durationMs / BUCKET_COUNT : 1;
  const bucketAccs = Array.from({ length: BUCKET_COUNT }, (_, idx) => ({
    startMs: idx * bucketWidthMs,
    endMs: (idx + 1) * bucketWidthMs,
    sampleCount: 0,
    counts: new Map<string, number>(),
  }));

  const sampleHotspotIds: (string | null)[] = [];

  for (let i = 0; i < samples.length; i++) {
    const ts = sampleTimestampsMs[i];
    const bucketIdx = Math.min(Math.floor(ts / bucketWidthMs), BUCKET_COUNT - 1);
    const bucket = bucketAccs[bucketIdx];
    bucket.sampleCount++;

    const sampleNode = nodeById.get(samples[i]);
    let hotspotId: string | null = null;

    if (sampleNode) {
      const k = nodeKey(sampleNode);
      hotspotId = frameKeyToHotspotId.get(k) ?? null;
      if (hotspotId) bucket.counts.set(hotspotId, (bucket.counts.get(hotspotId) ?? 0) + 1);
    }

    sampleHotspotIds.push(hotspotId);
  }

  const timeBuckets: JsTimeBucket[] = bucketAccs.map((b) => ({
    startMs: b.startMs,
    endMs: b.endMs,
    sampleCount: b.sampleCount,
    topHotspotIds: [...b.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id),
  }));

  // Final frame map by ID
  const frames = new Map<string, JsFrame>();
  for (const frame of frameByKey.values()) frames.set(frame.frameId, frame);

  // Source map metadata
  const sourceMaps = buildSourceMapsInfo(sym);

  return {
    sessionId: meta.sessionId,
    name: meta.name,
    startedAt: meta.startedAt,
    stoppedAt: meta.stoppedAt,
    durationMs,
    sampleCount: samples.length,
    samplingIntervalUs: meta.samplingIntervalUs,
    frames,
    hotspots,
    hotspotsById,
    modules,
    stacks,
    timeBuckets,
    sampleTimestampsMs,
    sampleHotspotIds,
    rawNodeToFrameId,
    rawProfile,
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
