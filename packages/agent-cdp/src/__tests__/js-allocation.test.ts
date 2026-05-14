import { formatJsAllocationLeakSignal, formatJsAllocationSummary } from "../js-allocation/formatters.js";
import { normalizeAllocationProfile } from "../js-allocation/normalize.js";
import { queryBucketed, queryHotspots, queryLeakSignal, querySummary } from "../js-allocation/query.js";
import type { CdpSamplingHeapProfile } from "../js-allocation/types.js";
import type { SymbolicationResult } from "../source-maps.js";

function makeProfile(): CdpSamplingHeapProfile {
  return {
    head: {
      id: 1,
      selfSize: 0,
      callFrame: {
        functionName: "(root)",
        scriptId: "0",
        url: "",
        lineNumber: 0,
        columnNumber: 0,
      },
      children: [
        {
          id: 2,
          selfSize: 0,
          callFrame: {
            functionName: "renderListItem",
            scriptId: "1",
            url: "http://localhost:8081/src/list.ts",
            lineNumber: 12,
            columnNumber: 3,
          },
          children: [
            {
              id: 3,
              selfSize: 0,
              callFrame: {
                functionName: "allocateRows",
                scriptId: "1",
                url: "http://localhost:8081/src/list.ts",
                lineNumber: 20,
                columnNumber: 5,
              },
            },
          ],
        },
        {
          id: 4,
          selfSize: 0,
          callFrame: {
            functionName: "createMessage",
            scriptId: "2",
            url: "http://localhost:8081/src/chat.ts",
            lineNumber: 8,
            columnNumber: 1,
          },
        },
      ],
    },
    samples: [
      { ordinal: 1, nodeId: 3, size: 512 * 1024 },
      { ordinal: 2, nodeId: 3, size: 768 * 1024 },
      { ordinal: 3, nodeId: 4, size: 256 * 1024 },
      { ordinal: 4, nodeId: 3, size: 1024 * 1024 },
      { ordinal: 5, nodeId: 3, size: 1536 * 1024 },
    ],
  };
}

describe("js-allocation", () => {
  it("summarizes top allocators and bucket growth", () => {
    const session = normalizeAllocationProfile(makeProfile(), {
      sessionId: "ja_1",
      name: "leak-check",
      startedAt: 1000,
      stoppedAt: 7000,
      samplingIntervalBytes: 32768,
      stackDepth: 16,
      includeObjectsCollectedByMajorGC: false,
      includeObjectsCollectedByMinorGC: false,
    });

    const summary = querySummary(session);
    expect(summary.topAllocators[0]?.functionName).toBe("allocateRows");
    expect(summary.bucketTrend.bucketCount).toBeGreaterThan(0);
    expect(summary.evidence.join(" ")).toContain("sampled bytes");

    const formatted = formatJsAllocationSummary(summary);
    expect(formatted).toContain("ja_1 leak-check");
    expect(formatted).toContain("allocateRows");
  });

  it("produces a leak signal and compact buckets", () => {
    const session = normalizeAllocationProfile(makeProfile(), {
      sessionId: "ja_2",
      name: "chat-screen",
      startedAt: 1000,
      stoppedAt: 6000,
      samplingIntervalBytes: undefined,
      stackDepth: undefined,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: false,
    });

    const leak = queryLeakSignal(session);
    expect(["low", "medium", "high"]).toContain(leak.level);
    expect(formatJsAllocationLeakSignal(leak)).toContain("score:");

    const hotspots = queryHotspots(session, 10, 0, "bytes");
    expect(hotspots.items.length).toBeGreaterThan(0);

    const bucketed = queryBucketed(session, 3);
    expect(bucketed.buckets.length).toBeLessThanOrEqual(3);
  });

  it("uses symbolicated names and source map coverage when available", () => {
    const sourceMaps: SymbolicationResult = {
      bundleUrls: ["http://localhost:8081/src/list.ts"],
      resolvedSourceMapUrls: ["http://localhost:8081/src/list.ts.map"],
      failures: [],
      totalMappableFrames: 2,
      symbolicatedCount: 2,
      isBundleUrl: (url) => url === "http://localhost:8081/src/list.ts",
      getOriginalPosition(url, line, column) {
        if (url === "http://localhost:8081/src/list.ts") {
          return {
            source: "src/components/VirtualList.tsx",
            line,
            column,
            name: "renderVirtualList",
          };
        }
        return null;
      },
    };

    const session = normalizeAllocationProfile(makeProfile(), {
      sessionId: "ja_3",
      name: "symbolicated",
      startedAt: 1000,
      stoppedAt: 7000,
      samplingIntervalBytes: 32768,
      stackDepth: 16,
      includeObjectsCollectedByMajorGC: false,
      includeObjectsCollectedByMinorGC: false,
      sourceMaps,
    });

    const summary = querySummary(session);
    expect(summary.sourceMaps.state).toBe("full");
    expect(summary.topAllocators.some((allocator) => allocator.functionName === "renderVirtualList")).toBe(true);
  });
});
