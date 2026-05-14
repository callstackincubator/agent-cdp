import { analyzeSnapshot } from "../heap-snapshot/analyze.js";
import { parseHeapSnapshot } from "../heap-snapshot/parser.js";
import { formatJsAllocationTimelineLeakSignal, formatJsAllocationTimelineSummary } from "../js-allocation-timeline/formatters.js";
import { normalizeAllocationTimeline } from "../js-allocation-timeline/normalize.js";
import { queryTimelineBuckets, queryTimelineHotspots, queryTimelineLeakSignal, queryTimelineSummary } from "../js-allocation-timeline/query.js";
import type { RawHeapSnapshotJson } from "../heap-snapshot/types.js";
import type { SymbolicationResult } from "../source-maps.js";

function makeRawTimelineSnapshot(): RawHeapSnapshotJson {
  return {
    snapshot: {
      meta: {
        node_fields: ["type", "name", "id", "self_size", "edge_count", "trace_node_id"],
        node_types: [["hidden", "object"]],
        edge_fields: ["type", "name_or_index", "to_node"],
        edge_types: [["property"]],
        trace_function_info_fields: ["name", "script_name", "script_id", "line", "column"],
        trace_node_fields: ["id", "function_info_index", "count", "size", "children"],
      },
      node_count: 3,
      edge_count: 2,
    },
    nodes: [
      0, 0, 1, 0, 2, 0,
      1, 1, 2, 4096, 0, 11,
      1, 2, 3, 2048, 0, 22,
    ],
    edges: [0, 0, 6, 0, 0, 12],
    strings: ["root", "LeakyList", "ChatBuffer", "renderListItem", "app/list.ts", "createMessage", "app/chat.ts"],
    trace_function_infos: [3, 4, 1, 10, 2, 5, 6, 2, 20, 4],
    trace_tree: [
      0,
      0,
      0,
      0,
      [
        11,
        0,
        4,
        6291456,
        [],
        22,
        1,
        2,
        2097152,
        [],
      ],
    ],
  };
}

describe("js-allocation-timeline", () => {
  it("summarizes tracked buckets and top live traces", () => {
    const raw = makeRawTimelineSnapshot();
    const analyzed = analyzeSnapshot(parseHeapSnapshot(raw), {
      snapshotId: "ms_1",
      name: "timeline-snapshot",
      filePath: "",
      capturedAt: 3000,
      collectGarbageRequested: false,
    });

    const session = normalizeAllocationTimeline(raw, {
      sessionId: "jat_1",
      name: "timeline-session",
      startedAt: 1000,
      stoppedAt: 7000,
      rawSnapshotJson: JSON.stringify(raw),
      chunkCount: 3,
      snapshot: analyzed,
      heapSamples: [
        { timestamp: 1100, lastSeenObjectId: 10, totalObjectCount: 10, totalSizeBytes: 1024 * 1024 },
        { timestamp: 2100, lastSeenObjectId: 20, totalObjectCount: 14, totalSizeBytes: 3 * 1024 * 1024 },
        { timestamp: 3100, lastSeenObjectId: 30, totalObjectCount: 18, totalSizeBytes: 5 * 1024 * 1024 },
        { timestamp: 4100, lastSeenObjectId: 40, totalObjectCount: 20, totalSizeBytes: 7 * 1024 * 1024 },
        { timestamp: 5100, lastSeenObjectId: 50, totalObjectCount: 21, totalSizeBytes: 8 * 1024 * 1024 },
      ],
    });

    const summary = queryTimelineSummary(session);
    expect(summary.session.snapshotId).toBe("ms_1");
    expect(summary.topTraces[0]?.functionName).toBe("renderListItem");
    expect(summary.evidence.length).toBeGreaterThan(0);
    expect(formatJsAllocationTimelineSummary(summary)).toContain("jat_1 timeline-session");

    const buckets = queryTimelineBuckets(session, 3);
    expect(buckets.buckets.length).toBe(3);

    const hotspots = queryTimelineHotspots(session, 10, 0);
    expect(hotspots.items.length).toBeGreaterThan(0);
  });

  it("produces a leak signal from persistent tracked heap growth", () => {
    const raw = makeRawTimelineSnapshot();
    const analyzed = analyzeSnapshot(parseHeapSnapshot(raw), {
      snapshotId: "ms_2",
      name: "timeline-snapshot-2",
      filePath: "",
      capturedAt: 3000,
      collectGarbageRequested: false,
    });

    const session = normalizeAllocationTimeline(raw, {
      sessionId: "jat_2",
      name: "timeline-session-2",
      startedAt: 1000,
      stoppedAt: 9000,
      rawSnapshotJson: JSON.stringify(raw),
      chunkCount: 2,
      snapshot: analyzed,
      heapSamples: [
        { timestamp: 1100, lastSeenObjectId: 10, totalObjectCount: 10, totalSizeBytes: 1024 * 1024 },
        { timestamp: 2100, lastSeenObjectId: 20, totalObjectCount: 16, totalSizeBytes: 4 * 1024 * 1024 },
        { timestamp: 3100, lastSeenObjectId: 30, totalObjectCount: 20, totalSizeBytes: 6 * 1024 * 1024 },
        { timestamp: 4100, lastSeenObjectId: 40, totalObjectCount: 22, totalSizeBytes: 7 * 1024 * 1024 },
        { timestamp: 5100, lastSeenObjectId: 50, totalObjectCount: 24, totalSizeBytes: 8 * 1024 * 1024 },
      ],
    });

    const leakSignal = queryTimelineLeakSignal(session);
    expect(["low", "medium", "high"]).toContain(leakSignal.level);
    expect(formatJsAllocationTimelineLeakSignal(leakSignal)).toContain("score:");
  });

  it("symbolicates allocation traces when source maps are available", () => {
    const raw = makeRawTimelineSnapshot();
    const analyzed = analyzeSnapshot(parseHeapSnapshot(raw), {
      snapshotId: "ms_3",
      name: "timeline-snapshot-3",
      filePath: "",
      capturedAt: 3000,
      collectGarbageRequested: false,
    });
    const sourceMaps: SymbolicationResult = {
      bundleUrls: ["app/list.ts"],
      resolvedSourceMapUrls: ["app/list.ts.map"],
      failures: [],
      totalMappableFrames: 2,
      symbolicatedCount: 2,
      isBundleUrl: (url) => url === "app/list.ts",
      getOriginalPosition(url, line, column) {
        if (url === "app/list.ts") {
          return {
            source: "src/list/VirtualizedList.tsx",
            line,
            column,
            name: "renderVirtualList",
          };
        }
        return null;
      },
    };

    const session = normalizeAllocationTimeline(raw, {
      sessionId: "jat_3",
      name: "timeline-session-3",
      startedAt: 1000,
      stoppedAt: 7000,
      rawSnapshotJson: JSON.stringify(raw),
      chunkCount: 3,
      snapshot: analyzed,
      sourceMaps,
      heapSamples: [{ timestamp: 1100, lastSeenObjectId: 10, totalObjectCount: 10, totalSizeBytes: 1024 * 1024 }],
    });

    const summary = queryTimelineSummary(session);
    expect(summary.sourceMaps.state).toBe("full");
    expect(summary.topTraces[0]?.functionName).toBe("renderVirtualList");
  });
});
