import { formatJsMemoryLeakSignal } from "../js-memory/formatters.js";
import { queryLeakSignal } from "../js-memory/query.js";
import type { JsMemorySample } from "../js-memory/types.js";

function sample(
  sampleId: string,
  usedJSHeapSizeMb: number,
  options: { label?: string; collectGarbageRequested?: boolean; timestamp?: number } = {},
): JsMemorySample {
  const derivedTimestamp = Number(sampleId.replace(/\D/g, "")) || 1;

  return {
    sampleId,
    label: options.label,
    timestamp: options.timestamp ?? derivedTimestamp,
    usedJSHeapSize: usedJSHeapSizeMb * 1024 * 1024,
    totalJSHeapSize: usedJSHeapSizeMb * 1024 * 1024,
    jsHeapSizeLimit: 64 * 1024 * 1024,
    source: "Runtime.getHeapUsage",
    collectGarbageRequested: options.collectGarbageRequested ?? false,
  };
}

describe("js-memory leak signal", () => {
  it("uses post-GC retained growth as the main leak signal", () => {
    const result = queryLeakSignal(
      [sample("jm_1", 10), sample("jm_2", 24, { label: "action" }), sample("jm_3", 21, { collectGarbageRequested: true })],
      { scoped: true },
    );

    expect(result.level).toBe("medium");
    expect(result.confidence).toBe("medium");
    expect(result.scope).toBe("bounded");
    expect(result.evidence.join(" ")).toContain("Post-GC checkpoint jm_3 is +11.0 MB vs baseline");
    expect(result.qualityNotes).toContain("Only 3 samples in this window; leak confidence is limited.");
  });

  it("calls out mixed full-history windows in compact output", () => {
    const result = queryLeakSignal([sample("jm_1", 10), sample("jm_2", 13), sample("jm_3", 11), sample("jm_4", 14)], {
      scoped: false,
    });

    expect(result.confidence).toBe("low");
    expect(result.qualityNotes[0]).toContain("Mixed workflows can skew the signal");
    expect(formatJsMemoryLeakSignal(result)).toContain("scope:full-history");
    expect(formatJsMemoryLeakSignal(result)).toContain("note: This result spans all stored samples");
  });

  it("keeps mixed full-history windows low-confidence even with GC checkpoints", () => {
    const result = queryLeakSignal(
      [
        sample("jm_1", 7),
        sample("jm_2", 8, { collectGarbageRequested: true }),
        sample("jm_3", 6, { collectGarbageRequested: true }),
        sample("jm_4", 12),
        sample("jm_5", 6.7, { collectGarbageRequested: true }),
      ],
      { scoped: false },
    );

    expect(result.level).toBe("none");
    expect(result.confidence).toBe("low");
    expect(result.qualityNotes[0]).toContain("Mixed workflows can skew the signal");
  });

  it("reports too-few-samples as low-confidence evidence", () => {
    const result = queryLeakSignal([sample("jm_1", 10)], { scoped: true });

    expect(result.level).toBe("none");
    expect(result.confidence).toBe("low");
    expect(result.qualityNotes[0]).toContain("bounded baseline and follow-up sample");
  });

  it("formats verbose output with confidence and quality notes", () => {
    const result = queryLeakSignal([sample("jm_1", 10), sample("jm_2", 12)], { scoped: false });

    expect(formatJsMemoryLeakSignal(result, true)).toContain("Confidence:");
    expect(formatJsMemoryLeakSignal(result, true)).toContain("Quality notes:");
  });
});
