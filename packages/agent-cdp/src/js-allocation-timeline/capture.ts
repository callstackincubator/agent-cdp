import type { CdpEventMessage, RuntimeSession } from "../types.js";
import type { RawHeapSnapshotJson } from "../heap-snapshot/types.js";

export interface JsAllocationTimelineCaptureOptions {
  name?: string;
}

interface HeapStatsSample {
  timestamp: number;
  lastSeenObjectId: number;
  totalObjectCount: number;
  totalSizeBytes: number;
}

interface ActiveCapture {
  name: string;
  startedAt: number;
  unsubscribe: () => void;
  chunks: string[];
  chunkCount: number;
  statsByFragment: Map<number, { objectCount: number; sizeBytes: number }>;
  samples: HeapStatsSample[];
  lastSeenObjectId: number;
  resolveCompletion: () => void;
  completion: Promise<void>;
}

export interface JsAllocationTimelineCaptureResult {
  name: string;
  startedAt: number;
  stoppedAt: number;
  chunkCount: number;
  rawSnapshotJson: string;
  rawSnapshot: RawHeapSnapshotJson;
  heapSamples: HeapStatsSample[];
}

export class JsAllocationTimelineCapture {
  private activeCapture: ActiveCapture | null = null;

  isActive(): boolean {
    return this.activeCapture !== null;
  }

  getActiveCaptureName(): string | null {
    return this.activeCapture?.name ?? null;
  }

  getElapsedMs(): number | null {
    return this.activeCapture ? Date.now() - this.activeCapture.startedAt : null;
  }

  async start(session: RuntimeSession, options: JsAllocationTimelineCaptureOptions = {}): Promise<void> {
    if (this.activeCapture) {
      throw new Error("A JS allocation timeline session is already running. Stop it first.");
    }

    try {
      await session.transport.send("HeapProfiler.enable");
    } catch {
      // Optional across targets.
    }

    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    const capture: ActiveCapture = {
      name: options.name ?? `allocation-timeline-${new Date().toISOString().slice(0, 19).replace("T", "-")}`,
      startedAt: Date.now(),
      unsubscribe: () => undefined,
      chunks: [],
      chunkCount: 0,
      statsByFragment: new Map(),
      samples: [],
      lastSeenObjectId: 0,
      resolveCompletion,
      completion,
    };

    capture.unsubscribe = session.transport.onEvent((message) => {
      this.handleEvent(capture, message);
    });

    this.activeCapture = capture;
    await session.transport.send("HeapProfiler.startTrackingHeapObjects", { trackAllocations: true });
  }

  async stop(session: RuntimeSession): Promise<JsAllocationTimelineCaptureResult> {
    if (!this.activeCapture) {
      throw new Error("No active JS allocation timeline session to stop.");
    }

    const capture = this.activeCapture;
    this.activeCapture = null;
    const stoppedAt = Date.now();

    try {
      await session.transport.send("HeapProfiler.stopTrackingHeapObjects", { reportProgress: true });
      await capture.completion;
    } finally {
      capture.unsubscribe();
      try {
        await session.transport.send("HeapProfiler.disable");
      } catch {}
    }

    const rawSnapshotJson = capture.chunks.join("");

    return {
      name: capture.name,
      startedAt: capture.startedAt,
      stoppedAt,
      chunkCount: capture.chunkCount,
      rawSnapshotJson,
      rawSnapshot: JSON.parse(rawSnapshotJson) as RawHeapSnapshotJson,
      heapSamples: capture.samples,
    };
  }

  private handleEvent(capture: ActiveCapture, message: CdpEventMessage): void {
    if (message.method === "HeapProfiler.heapStatsUpdate") {
      const statsUpdate = Array.isArray(message.params?.statsUpdate) ? message.params.statsUpdate : [];
      for (let i = 0; i + 2 < statsUpdate.length; i += 3) {
        const fragmentIndex = Number(statsUpdate[i]);
        const objectCount = Number(statsUpdate[i + 1]);
        const sizeBytes = Number(statsUpdate[i + 2]);
        capture.statsByFragment.set(fragmentIndex, { objectCount, sizeBytes });
      }
      return;
    }

    if (message.method === "HeapProfiler.lastSeenObjectId") {
      const lastSeenObjectId = typeof message.params?.lastSeenObjectId === "number" ? message.params.lastSeenObjectId : 0;
      const timestamp = typeof message.params?.timestamp === "number" ? message.params.timestamp : Date.now();
      let totalObjectCount = 0;
      let totalSizeBytes = 0;
      for (const fragment of capture.statsByFragment.values()) {
        totalObjectCount += fragment.objectCount;
        totalSizeBytes += fragment.sizeBytes;
      }
      capture.lastSeenObjectId = lastSeenObjectId;
      capture.samples.push({ timestamp, lastSeenObjectId, totalObjectCount, totalSizeBytes });
      return;
    }

    if (message.method === "HeapProfiler.addHeapSnapshotChunk") {
      const chunk = typeof message.params?.chunk === "string" ? message.params.chunk : "";
      capture.chunks.push(chunk);
      capture.chunkCount += 1;
      return;
    }

    if (message.method === "HeapProfiler.reportHeapSnapshotProgress" && message.params?.finished === true) {
      capture.resolveCompletion();
    }
  }
}
