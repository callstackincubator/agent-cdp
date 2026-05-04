import type { RuntimeSession } from "../types.js";
import type { CdpSamplingHeapProfile } from "./types.js";

export interface JsAllocationCaptureOptions {
  name?: string;
  samplingIntervalBytes?: number;
  stackDepth?: number;
  includeObjectsCollectedByMajorGC?: boolean;
  includeObjectsCollectedByMinorGC?: boolean;
}

export interface JsAllocationCaptureResult {
  name: string;
  startedAt: number;
  stoppedAt: number;
  samplingIntervalBytes: number | undefined;
  stackDepth: number | undefined;
  includeObjectsCollectedByMajorGC: boolean;
  includeObjectsCollectedByMinorGC: boolean;
  rawProfile: CdpSamplingHeapProfile;
}

interface ActiveCapture {
  name: string;
  startedAt: number;
  samplingIntervalBytes: number | undefined;
  stackDepth: number | undefined;
  includeObjectsCollectedByMajorGC: boolean;
  includeObjectsCollectedByMinorGC: boolean;
}

export class JsAllocationCapture {
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

  async start(session: RuntimeSession, options: JsAllocationCaptureOptions = {}): Promise<void> {
    if (this.activeCapture) {
      throw new Error("A JS allocation session is already running. Stop it first.");
    }

    try {
      await session.transport.send("HeapProfiler.enable");
    } catch {
      // Optional across targets.
    }

    const params: Record<string, unknown> = {};
    if (options.samplingIntervalBytes !== undefined) {
      params.samplingInterval = options.samplingIntervalBytes;
    }
    if (options.stackDepth !== undefined) {
      params.stackDepth = options.stackDepth;
    }
    if (options.includeObjectsCollectedByMajorGC !== undefined) {
      params.includeObjectsCollectedByMajorGC = options.includeObjectsCollectedByMajorGC;
    }
    if (options.includeObjectsCollectedByMinorGC !== undefined) {
      params.includeObjectsCollectedByMinorGC = options.includeObjectsCollectedByMinorGC;
    }

    await session.transport.send("HeapProfiler.startSampling", params);

    this.activeCapture = {
      name: options.name ?? `allocation-${new Date().toISOString().slice(0, 19).replace("T", "-")}`,
      startedAt: Date.now(),
      samplingIntervalBytes: options.samplingIntervalBytes,
      stackDepth: options.stackDepth,
      includeObjectsCollectedByMajorGC: options.includeObjectsCollectedByMajorGC ?? false,
      includeObjectsCollectedByMinorGC: options.includeObjectsCollectedByMinorGC ?? false,
    };
  }

  async stop(session: RuntimeSession): Promise<JsAllocationCaptureResult> {
    if (!this.activeCapture) {
      throw new Error("No active JS allocation session to stop.");
    }

    const capture = this.activeCapture;
    this.activeCapture = null;
    const stoppedAt = Date.now();

    let rawResult: unknown;
    try {
      rawResult = await session.transport.send("HeapProfiler.stopSampling");
    } finally {
      try {
        await session.transport.send("HeapProfiler.disable");
      } catch {}
    }

    return {
      name: capture.name,
      startedAt: capture.startedAt,
      stoppedAt,
      samplingIntervalBytes: capture.samplingIntervalBytes,
      stackDepth: capture.stackDepth,
      includeObjectsCollectedByMajorGC: capture.includeObjectsCollectedByMajorGC,
      includeObjectsCollectedByMinorGC: capture.includeObjectsCollectedByMinorGC,
      rawProfile: (rawResult as { profile: CdpSamplingHeapProfile }).profile,
    };
  }
}
