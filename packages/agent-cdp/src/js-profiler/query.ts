import type {
  JsDiffResult,
  JsHotspotDetailResult,
  JsHotspotsResult,
  JsModulesResult,
  JsProfileSession,
  JsProfileSummary,
  JsSessionListEntry,
  JsSliceResult,
  JsSourceMapsResult,
  JsStacksResult,
} from "./types.js";

const CAVEATS_DEFAULT = ["Sample-based CPU profile, not exact wall-clock timing"];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function querySessions(sessions: JsProfileSession[], limit: number, offset: number): JsSessionListEntry[] {
  return sessions.slice(offset, offset + limit).map((s) => ({
    sessionId: s.sessionId,
    name: s.name,
    durationMs: Math.round(s.durationMs),
    sampleCount: s.sampleCount,
    startedAt: s.startedAt,
  }));
}

export function querySummary(session: JsProfileSession): JsProfileSummary {
  const caveats = [...CAVEATS_DEFAULT];
  if (session.samplingIntervalUs === undefined) {
    caveats.push("Sampling interval not configured — using runtime default");
  }

  const sm = session.sourceMaps;
  const symbolicatedPct =
    sm.totalMappableFrameCount > 0
      ? round1((sm.symbolicatedFrameCount / sm.totalMappableFrameCount) * 100)
      : 0;

  const sourceMapsNotes: string[] = [];
  if (sm.state === "full") {
    sourceMapsNotes.push("Module rollups and hotspots use original source files");
  } else if (sm.state === "partial") {
    sourceMapsNotes.push("Module rollups use original source files where available");
    sourceMapsNotes.push("Some frames could not be mapped from bundle positions");
  } else if (sm.state === "failed") {
    sourceMapsNotes.push("Source map resolution failed — reporting bundle-level data");
  } else {
    sourceMapsNotes.push("No bundle scripts detected — reporting raw frame URLs");
  }

  const topHotspots = session.hotspots
    .filter((h) => {
      const frame = session.frames.get(h.frameId);
      return frame && !frame.isRuntime;
    })
    .slice(0, 10)
    .map((h) => {
      const frame = session.frames.get(h.frameId)!;
      return {
        hotspotId: h.hotspotId,
        functionName: frame.functionName,
        module: frame.moduleName,
        selfTimeMs: round1(h.selfTimeMs),
        totalTimeMs: round1(h.totalTimeMs),
        selfPercent: round1(h.selfPercent),
        sampleCount: h.selfSampleCount,
      };
    });

  const topModules = session.modules.slice(0, 10).map((m) => ({
    module: m.moduleName,
    selfTimeMs: round1(m.selfTimeMs),
    selfPercent: round1(m.selfPercent),
  }));

  const topStacks = session.stacks.slice(0, 5).map((s) => ({
    stackId: s.stackId,
    percent: round1(s.percent),
    frames: s.frames,
  }));

  return {
    session: {
      sessionId: session.sessionId,
      name: session.name,
      durationMs: Math.round(session.durationMs),
      sampleCount: session.sampleCount,
      samplingIntervalUs: session.samplingIntervalUs,
      symbolicationState: sm.state,
    },
    sourceMaps: {
      state: sm.state,
      bundleCount: sm.bundleUrls.length,
      resolvedCount: sm.resolvedSourceMapUrls.length,
      symbolicatedFramePercent: symbolicatedPct,
      notes: sourceMapsNotes,
    },
    topHotspots,
    topModules,
    topStacks,
    caveats,
  };
}

export function querySourceMaps(session: JsProfileSession): JsSourceMapsResult {
  const sm = session.sourceMaps;
  const symbolicatedPct =
    sm.totalMappableFrameCount > 0
      ? round1((sm.symbolicatedFrameCount / sm.totalMappableFrameCount) * 100)
      : 0;

  return {
    sessionId: session.sessionId,
    state: sm.state,
    bundleUrls: sm.bundleUrls,
    resolvedSourceMapUrls: sm.resolvedSourceMapUrls,
    symbolicatedFrameCount: sm.symbolicatedFrameCount,
    totalMappableFrameCount: sm.totalMappableFrameCount,
    symbolicatedFramePercent: symbolicatedPct,
    failures: sm.failures,
  };
}

export interface HotspotsOptions {
  sessionId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  minSelfMs?: number;
  includeRuntime?: boolean;
}

export function queryHotspots(session: JsProfileSession, opts: HotspotsOptions): JsHotspotsResult {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let hotspots = session.hotspots.filter((h) => {
    const frame = session.frames.get(h.frameId);
    if (!frame) return false;
    if (!opts.includeRuntime && frame.isRuntime) return false;
    if (opts.minSelfMs !== undefined && h.selfTimeMs < opts.minSelfMs) return false;
    return true;
  });

  if (opts.sortBy === "totalMs") {
    hotspots = [...hotspots].sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }

  const total = hotspots.length;
  const items = hotspots.slice(offset, offset + limit).map((h) => {
    const frame = session.frames.get(h.frameId)!;
    return {
      hotspotId: h.hotspotId,
      functionName: frame.functionName,
      module: frame.moduleName,
      selfTimeMs: round1(h.selfTimeMs),
      totalTimeMs: round1(h.totalTimeMs),
      selfPercent: round1(h.selfPercent),
      totalPercent: round1(h.totalPercent),
      sampleCount: h.selfSampleCount,
    };
  });

  return { sessionId: session.sessionId, total, offset, items };
}

export function queryHotspotDetail(
  session: JsProfileSession,
  hotspotId: string,
  stackLimit = 5,
): JsHotspotDetailResult {
  const hotspot = session.hotspotsById.get(hotspotId);
  if (!hotspot) throw new Error(`Hotspot ${hotspotId} not found in session ${session.sessionId}`);

  const frame = session.frames.get(hotspot.frameId);
  if (!frame) throw new Error(`Frame ${hotspot.frameId} not found`);

  const representativeStacks = session.stacks
    .filter((s) => s.frameIds.includes(frame.frameId))
    .slice(0, stackLimit)
    .map((s) => ({ stackId: s.stackId, percent: round1(s.percent), frames: s.frames }));

  const activeTimeBuckets = session.timeBuckets
    .filter((b) => b.topHotspotIds.includes(hotspotId))
    .map((b) => ({ startMs: Math.round(b.startMs), endMs: Math.round(b.endMs), sampleCount: b.sampleCount }));

  return {
    hotspot: {
      hotspotId: hotspot.hotspotId,
      selfTimeMs: round1(hotspot.selfTimeMs),
      totalTimeMs: round1(hotspot.totalTimeMs),
      selfPercent: round1(hotspot.selfPercent),
      totalPercent: round1(hotspot.totalPercent),
      selfSampleCount: hotspot.selfSampleCount,
      totalSampleCount: hotspot.totalSampleCount,
    },
    frame: {
      frameId: frame.frameId,
      functionName: frame.functionName,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      moduleName: frame.moduleName,
      isNative: frame.isNative,
      isRuntime: frame.isRuntime,
      symbolicationStatus: frame.symbolicationStatus,
      bundleUrl: frame.bundleUrl,
      bundleLineNumber: frame.bundleLineNumber,
      bundleColumnNumber: frame.bundleColumnNumber,
    },
    representativeStacks,
    activeTimeBuckets,
    caveats: CAVEATS_DEFAULT,
  };
}

export interface ModulesOptions {
  sessionId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
}

export function queryModules(session: JsProfileSession, opts: ModulesOptions): JsModulesResult {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let modules = [...session.modules];
  if (opts.sortBy === "totalMs") {
    modules.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }

  const total = modules.length;
  const items = modules.slice(offset, offset + limit).map((m) => ({
    ...m,
    selfTimeMs: round1(m.selfTimeMs),
    totalTimeMs: round1(m.totalTimeMs),
    selfPercent: round1(m.selfPercent),
    totalPercent: round1(m.totalPercent),
  }));

  return { sessionId: session.sessionId, total, offset, items };
}

export interface StacksOptions {
  sessionId?: string;
  limit?: number;
  offset?: number;
  minMs?: number;
  maxDepth?: number;
}

export function queryStacks(session: JsProfileSession, opts: StacksOptions): JsStacksResult {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const maxDepth = opts.maxDepth ?? 8;

  let stacks = session.stacks;
  if (opts.minMs !== undefined) {
    stacks = stacks.filter((s) => s.timeMs >= opts.minMs!);
  }

  const total = stacks.length;
  const items = stacks.slice(offset, offset + limit).map((s) => ({
    stackId: s.stackId,
    percent: round1(s.percent),
    timeMs: round1(s.timeMs),
    sampleCount: s.sampleCount,
    frames: s.frames.slice(0, maxDepth),
  }));

  return { sessionId: session.sessionId, total, offset, items };
}

export function querySlice(
  session: JsProfileSession,
  startMs: number,
  endMs: number,
  limit = 10,
): JsSliceResult {
  const inRangeHotspotIds: (string | null)[] = [];

  for (let i = 0; i < session.sampleTimestampsMs.length; i++) {
    const ts = session.sampleTimestampsMs[i];
    if (ts >= startMs && ts <= endMs) {
      inRangeHotspotIds.push(session.sampleHotspotIds[i]);
    }
  }

  const hotspotCounts = new Map<string, number>();
  for (const id of inRangeHotspotIds) {
    if (id) hotspotCounts.set(id, (hotspotCounts.get(id) ?? 0) + 1);
  }

  const sliceSampleCount = inRangeHotspotIds.length;

  const topHotspots = [...hotspotCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hotspotId, count]) => {
      const h = session.hotspotsById.get(hotspotId)!;
      const frame = session.frames.get(h.frameId)!;
      return {
        hotspotId,
        functionName: frame.functionName,
        module: frame.moduleName,
        selfSampleCount: count,
        selfPercent: sliceSampleCount > 0 ? round1((count / sliceSampleCount) * 100) : 0,
      };
    });

  const coveragePercent =
    session.sampleCount > 0 ? round1((sliceSampleCount / session.sampleCount) * 100) : 0;

  const caveats = [...CAVEATS_DEFAULT];
  if (sliceSampleCount === 0) {
    caveats.push("No samples found in the requested time range");
  }

  return {
    sessionId: session.sessionId,
    requestedRange: { startMs, endMs },
    sampleCount: sliceSampleCount,
    coveragePercent,
    topHotspots,
    caveats,
  };
}

export function queryDiff(
  base: JsProfileSession,
  compare: JsProfileSession,
  limit = 10,
  minDeltaPct?: number,
): JsDiffResult {
  // Index base hotspots by frame identity
  const baseByIdentity = new Map<
    string,
    { hotspot: JsProfileSession["hotspots"][0]; frame: JsProfileSession["frames"] extends Map<string, infer F> ? F : never }
  >();

  for (const h of base.hotspots) {
    const frame = base.frames.get(h.frameId);
    if (!frame || frame.isRuntime) continue;
    const key = `${frame.functionName}|${frame.url}|${frame.lineNumber}|${frame.columnNumber}`;
    baseByIdentity.set(key, { hotspot: h, frame });
  }

  let unmatchedCount = 0;
  const deltas: Array<{
    functionName: string;
    module: string;
    baseSelfMs: number;
    compareSelfMs: number;
    deltaSelfMs: number;
    deltaSelfPct: number | null;
    basePercent: number;
    comparePercent: number;
  }> = [];

  for (const h of compare.hotspots) {
    const frame = compare.frames.get(h.frameId);
    if (!frame || frame.isRuntime) continue;

    const key = `${frame.functionName}|${frame.url}|${frame.lineNumber}|${frame.columnNumber}`;
    const baseMatch = baseByIdentity.get(key);

    const baseSelfMs = baseMatch?.hotspot.selfTimeMs ?? 0;
    const compareSelfMs = h.selfTimeMs;
    const deltaSelfMs = compareSelfMs - baseSelfMs;

    if (!baseMatch) unmatchedCount++;
    if (Math.abs(deltaSelfMs) < 0.1) continue;

    const deltaSelfPct =
      baseSelfMs > 0 ? ((compareSelfMs - baseSelfMs) / baseSelfMs) * 100 : null;

    if (minDeltaPct !== undefined && deltaSelfPct !== null && Math.abs(deltaSelfPct) < minDeltaPct) {
      continue;
    }

    deltas.push({
      functionName: frame.functionName,
      module: frame.moduleName,
      baseSelfMs: round1(baseSelfMs),
      compareSelfMs: round1(compareSelfMs),
      deltaSelfMs: round1(deltaSelfMs),
      deltaSelfPct: deltaSelfPct !== null ? round1(deltaSelfPct) : null,
      basePercent: round1(baseMatch?.hotspot.selfPercent ?? 0),
      comparePercent: round1(h.selfPercent),
    });
  }

  const sorted = [...deltas].sort((a, b) => b.deltaSelfMs - a.deltaSelfMs);
  const regressed = sorted.filter((d) => d.deltaSelfMs > 0).slice(0, limit);
  const improved = [...sorted].reverse().filter((d) => d.deltaSelfMs < 0).slice(0, limit);

  const caveats = [...CAVEATS_DEFAULT];
  if (unmatchedCount > 0) {
    caveats.push(
      `${unmatchedCount} function(s) in compare session had no match in base — may indicate code changes or minification differences`,
    );
  }

  return {
    base: {
      sessionId: base.sessionId,
      name: base.name,
      durationMs: Math.round(base.durationMs),
      sampleCount: base.sampleCount,
    },
    compare: {
      sessionId: compare.sessionId,
      name: compare.name,
      durationMs: Math.round(compare.durationMs),
      sampleCount: compare.sampleCount,
    },
    regressed,
    improved,
    caveats,
  };
}
