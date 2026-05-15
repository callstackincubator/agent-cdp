import { formatJsHotspotDetail, formatJsSessionList } from "../js-profiler/formatters.js";
import { normalizeProfile } from "../js-profiler/normalize.js";
import { queryHotspotDetail, queryHotspots, querySessions } from "../js-profiler/query.js";
import type { CdpProfile, JsProfileSession } from "../js-profiler/types.js";

function createSession(): JsProfileSession {
  const frames = new Map([
    ["f-root", { frameId: "f-root", functionName: "root", url: "app:///root.ts", lineNumber: 0, columnNumber: 0, moduleName: "root.ts", isNative: false, isRuntime: false, isAnonymous: false, symbolicationStatus: "not-applicable" as const }],
    ["f-parent", { frameId: "f-parent", functionName: "renderList", url: "app:///parent.ts", lineNumber: 1, columnNumber: 0, moduleName: "parent.ts", isNative: false, isRuntime: false, isAnonymous: false, symbolicationStatus: "not-applicable" as const }],
    ["f-hot", { frameId: "f-hot", functionName: "expensiveLoop", url: "app:///hot.ts", lineNumber: 2, columnNumber: 0, moduleName: "hot.ts", isNative: false, isRuntime: false, isAnonymous: false, symbolicationStatus: "not-applicable" as const }],
    ["f-child", { frameId: "f-child", functionName: "buildRow", url: "app:///child.ts", lineNumber: 3, columnNumber: 0, moduleName: "child.ts", isNative: false, isRuntime: false, isAnonymous: false, symbolicationStatus: "not-applicable" as const }],
    ["f-other", { frameId: "f-other", functionName: "otherWork", url: "app:///other.ts", lineNumber: 4, columnNumber: 0, moduleName: "other.ts", isNative: false, isRuntime: false, isAnonymous: false, symbolicationStatus: "not-applicable" as const }],
  ]);

  const hotspot = {
    hotspotId: "h1",
    frameId: "f-hot",
    selfSampleCount: 3,
    totalSampleCount: 4,
    selfTimeMs: 3,
    totalTimeMs: 4,
    selfPercent: 60,
    totalPercent: 80,
  };

  const rawProfile: CdpProfile = {
    startTime: 0,
    endTime: 5000,
    nodes: [
      { id: 1, callFrame: { functionName: "root", scriptId: "1", url: "app:///root.ts", lineNumber: 0, columnNumber: 0 }, children: [2] },
      { id: 2, callFrame: { functionName: "renderList", scriptId: "2", url: "app:///parent.ts", lineNumber: 1, columnNumber: 0 }, children: [3, 5] },
      { id: 3, callFrame: { functionName: "expensiveLoop", scriptId: "3", url: "app:///hot.ts", lineNumber: 2, columnNumber: 0 }, children: [4] },
      { id: 4, callFrame: { functionName: "buildRow", scriptId: "4", url: "app:///child.ts", lineNumber: 3, columnNumber: 0 } },
      { id: 5, callFrame: { functionName: "otherWork", scriptId: "5", url: "app:///other.ts", lineNumber: 4, columnNumber: 0 } },
    ],
    samples: [3, 3, 4, 5, 3],
    timeDeltas: [1000, 1000, 1000, 1000, 1000],
  };

  return {
    sessionId: "s1",
    name: "cpu-session",
    startedAt: 0,
    stoppedAt: 5000,
    durationMs: 5,
    sampleCount: 5,
    samplingIntervalUs: 1000,
    frames,
    hotspots: [
      hotspot,
      { hotspotId: "h2", frameId: "f-child", selfSampleCount: 1, totalSampleCount: 1, selfTimeMs: 1, totalTimeMs: 1, selfPercent: 20, totalPercent: 20 },
      { hotspotId: "h3", frameId: "f-other", selfSampleCount: 1, totalSampleCount: 1, selfTimeMs: 1, totalTimeMs: 1, selfPercent: 20, totalPercent: 20 },
    ],
    hotspotsById: new Map([
      ["h1", hotspot],
      ["h2", { hotspotId: "h2", frameId: "f-child", selfSampleCount: 1, totalSampleCount: 1, selfTimeMs: 1, totalTimeMs: 1, selfPercent: 20, totalPercent: 20 }],
      ["h3", { hotspotId: "h3", frameId: "f-other", selfSampleCount: 1, totalSampleCount: 1, selfTimeMs: 1, totalTimeMs: 1, selfPercent: 20, totalPercent: 20 }],
    ]),
    modules: [],
    stacks: [
      { stackId: "s1", frameIds: ["f-hot", "f-parent", "f-root"], frames: ["expensiveLoop", "renderList", "root"], sampleCount: 2, timeMs: 2, percent: 40 },
      { stackId: "s2", frameIds: ["f-child", "f-hot", "f-parent", "f-root"], frames: ["buildRow", "expensiveLoop", "renderList", "root"], sampleCount: 1, timeMs: 1, percent: 20 },
    ],
    timeBuckets: Array.from({ length: 5 }, (_, index) => ({ startMs: index, endMs: index + 1, sampleCount: 1, topHotspotIds: [] })),
    sampleTimestampsMs: [1, 2, 3, 4, 5],
    sampleHotspotIds: ["h1", "h1", "h2", "h3", "h1"],
    rawNodeToFrameId: new Map([
      [1, "f-root"],
      [2, "f-parent"],
      [3, "f-hot"],
      [4, "f-child"],
      [5, "f-other"],
    ]),
    rawProfile,
    sourceMaps: {
      state: "none",
      bundleUrls: [],
      resolvedSourceMapUrls: [],
      symbolicatedFrameCount: 0,
      totalMappableFrameCount: 0,
      failures: [],
    },
  };
}

describe("js profiler queries", () => {
  it("filters hotspots by total time", () => {
    const result = queryHotspots(createSession(), { minTotalMs: 4 });
    expect(result.items.map((item) => item.hotspotId)).toEqual(["h1"]);
  });

  it("explains repeated work, callers, callees, and hotspot time buckets", () => {
    const result = queryHotspotDetail(createSession(), "h1");

    expect(result.hotspot.delegatedTimeMs).toBe(1);
    expect(result.hotspot.delegatedPercentOfTotal).toBe(25);
    expect(result.occurrence).toMatchObject({
      runCount: 2,
      averageRunSamples: 1.5,
      averageRunMs: 1.5,
      longestRunSamples: 2,
      longestRunMs: 2,
      firstSeenMs: 1,
      lastSeenMs: 5,
    });
    expect(result.callers[0]).toMatchObject({ functionName: "renderList", sampleCount: 4, percent: 100 });
    expect(result.callees[0]).toMatchObject({ functionName: "buildRow", sampleCount: 1, percent: 100 });
    expect(result.activeTimeBuckets).toEqual([
      { startMs: 1, endMs: 2, sampleCount: 1, percentOfHotspotSamples: 33.3 },
      { startMs: 2, endMs: 3, sampleCount: 1, percentOfHotspotSamples: 33.3 },
      { startMs: 4, endMs: 5, sampleCount: 1, percentOfHotspotSamples: 33.3 },
    ]);
  });

  it("formats the richer hotspot detail output", () => {
    const output = formatJsHotspotDetail(queryHotspotDetail(createSession(), "h1"), true);
    expect(output).toContain("Delegated to children: 25% (1ms)");
    expect(output).toContain("Repeated work: 2 runs, avg 1.5ms (1.5 samples), longest 2ms (2 samples)");
    expect(output).toContain("Top callers:");
    expect(output).toContain("Top callees:");
    expect(output).toContain("1–2ms (1 samples, 33.3% of hotspot self time)");
  });

  it("uses the real capture window for listed session duration when raw profile timestamps are cumulative", () => {
    const session = normalizeProfile(
      {
        startTime: 688773992732,
        endTime: 689336975523,
        nodes: [
          { id: 1, callFrame: { functionName: "[root]", scriptId: "0", url: "[root]", lineNumber: 0, columnNumber: 0 }, children: [2] },
          { id: 2, callFrame: { functionName: "work", scriptId: "1", url: "app:///work.ts", lineNumber: 0, columnNumber: 0 } },
        ],
        samples: [1, 2, 2, 2],
        timeDeltas: [0, 562950302, 20986, 11501],
      } satisfies CdpProfile,
      {
        sessionId: "js_2",
        name: "playground-sdk",
        startedAt: 1_747_302_762_405,
        stoppedAt: 1_747_303_324_051,
        samplingIntervalUs: undefined,
      },
    );

    expect(session.durationMs).toBe(561646);
    expect(session.sampleTimestampsMs.at(-1)).toBeCloseTo(561646, 3);

    const output = formatJsSessionList(querySessions([session], 20, 0));
    expect(output).toContain("js_2  playground-sdk  561.65s  4 samples");
  });
});
