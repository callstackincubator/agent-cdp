import type { RuntimeSession } from "../types.js";
import { captureHeapUsage } from "./capture.js";
import { queryDiff, queryLeakSignal, queryList, querySampleResult, querySummary, queryTrend } from "./query.js";
import { JsMemoryStore } from "./store.js";
import type {
  JsMemoryDiffResult,
  JsMemoryLeakSignalResult,
  JsMemoryListResult,
  JsMemorySampleResult,
  JsMemorySummaryResult,
  JsMemoryTrendResult,
} from "./types.js";

export class JsHeapUsageMonitor {
  private readonly store = new JsMemoryStore();

  async sample(
    session: RuntimeSession,
    opts: { label?: string; collectGarbage?: boolean } = {},
  ): Promise<JsMemorySampleResult> {
    const sampleId = this.store.generateId();
    const sample = await captureHeapUsage(session, sampleId, opts);
    this.store.add(sample);
    return querySampleResult(sample);
  }

  list(limit = 20, offset = 0): JsMemoryListResult {
    return queryList(this.store.list(), limit, offset);
  }

  getSummary(): JsMemorySummaryResult {
    return querySummary(this.store.all());
  }

  getDiff(baseSampleId: string, compareSampleId: string): JsMemoryDiffResult {
    const base = this.store.get(baseSampleId);
    const compare = this.store.get(compareSampleId);
    if (!base) throw new Error(`Sample ${baseSampleId} not found`);
    if (!compare) throw new Error(`Sample ${compareSampleId} not found`);
    return queryDiff(base, compare);
  }

  getTrend(limit?: number): JsMemoryTrendResult {
    return queryTrend(this.store.all(), limit);
  }

  getLeakSignal(): JsMemoryLeakSignalResult {
    return queryLeakSignal(this.store.all());
  }
}

export type {
  JsMemoryDiffResult,
  JsMemoryLeakSignalResult,
  JsMemoryListResult,
  JsMemorySampleResult,
  JsMemorySummaryResult,
  JsMemoryTrendResult,
} from "./types.js";
