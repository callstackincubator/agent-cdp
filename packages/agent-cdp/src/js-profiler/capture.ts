import type { RuntimeSession } from "../types.js";

export interface CaptureOptions {
  name?: string;
  samplingIntervalUs?: number;
}

export interface CaptureResult {
  name: string;
  startedAt: number;
  stoppedAt: number;
  samplingIntervalUs: number | undefined;
  rawProfile: unknown;
}

interface ActiveCapture {
  name: string;
  startedAt: number;
  samplingIntervalUs: number | undefined;
}

export class JsProfileCapture {
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

  async start(session: RuntimeSession, options: CaptureOptions = {}): Promise<void> {
    if (this.activeCapture) {
      throw new Error("A JS profile is already running. Stop it first.");
    }

    try {
      await session.transport.send("Profiler.enable");
    } catch {
      // Not supported by all targets (e.g. React Native / Hermes); safe to continue
    }

    if (options.samplingIntervalUs !== undefined) {
      try {
        await session.transport.send("Profiler.setSamplingInterval", {
          interval: options.samplingIntervalUs,
        });
      } catch {
        // setSamplingInterval is optional; not all targets support it
      }
    }

    await session.transport.send("Profiler.start");

    this.activeCapture = {
      name: options.name ?? `profile-${new Date().toISOString().slice(0, 19).replace("T", "-")}`,
      startedAt: Date.now(),
      samplingIntervalUs: options.samplingIntervalUs,
    };
  }

  async stop(session: RuntimeSession): Promise<CaptureResult> {
    if (!this.activeCapture) {
      throw new Error("No active JS profile to stop.");
    }

    const capture = this.activeCapture;
    this.activeCapture = null;
    const stoppedAt = Date.now();

    let rawResult: unknown;
    try {
      rawResult = await session.transport.send("Profiler.stop");
    } finally {
      try {
        await session.transport.send("Profiler.disable");
      } catch {}
    }

    const rawProfile = (rawResult as { profile: unknown }).profile;

    return {
      name: capture.name,
      startedAt: capture.startedAt,
      stoppedAt,
      samplingIntervalUs: capture.samplingIntervalUs,
      rawProfile,
    };
  }
}
