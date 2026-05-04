import type { RuntimeSession } from "../types.js";
import type { JsMemorySample } from "./types.js";

const JS_HEAP_CAVEATS = ["usedJSHeapSize reflects JavaScript heap only, not full process RAM"];

export async function captureHeapUsage(
  session: RuntimeSession,
  sampleId: string,
  opts: { label?: string; collectGarbage?: boolean } = {},
): Promise<JsMemorySample> {
  if (opts.collectGarbage) {
    await session.transport.send("HeapProfiler.collectGarbage");
  }

  const result = await session.transport.send("Runtime.getHeapUsage") as {
    usedSize: number;
    totalSize: number;
  };

  return {
    sampleId,
    label: opts.label,
    timestamp: Date.now(),
    usedJSHeapSize: result.usedSize,
    totalJSHeapSize: result.totalSize,
    jsHeapSizeLimit: 0,
    source: "Runtime.getHeapUsage",
    collectGarbageRequested: opts.collectGarbage ?? false,
  };
}

export { JS_HEAP_CAVEATS };
