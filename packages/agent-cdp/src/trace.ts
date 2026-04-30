import fs from "node:fs/promises";
import path from "node:path";

import type { CdpEventMessage, RuntimeSession, TraceRecordingSummary } from "./types.js";

const TRACE_CATEGORIES = [
  "-*",
  "blink.console",
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-v8.cpu_profiler.hires",
  "v8.execute",
  "v8",
];

interface ActiveTrace {
  events: unknown[];
  session: RuntimeSession;
  unsubscribe: () => void;
  resolveCompletion: () => void;
  completion: Promise<void>;
}

export class TraceRecorder {
  private activeTrace: ActiveTrace | null = null;

  isActive(): boolean {
    return this.activeTrace !== null;
  }

  async start(session: RuntimeSession): Promise<void> {
    if (this.activeTrace) {
      throw new Error("A trace is already running");
    }

    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    const activeTrace: ActiveTrace = {
      events: [],
      session,
      unsubscribe: () => undefined,
      resolveCompletion,
      completion,
    };

    activeTrace.unsubscribe = session.transport.onEvent((message) => {
      this.handleEvent(activeTrace, message);
    });

    try {
      await session.transport.send("Tracing.start", {
        categories: TRACE_CATEGORIES.join(","),
        transferMode: "ReportEvents",
      });
      this.activeTrace = activeTrace;
    } catch (error) {
      activeTrace.unsubscribe();
      throw error;
    }
  }

  async stop(filePath?: string): Promise<TraceRecordingSummary> {
    if (!this.activeTrace) {
      throw new Error("No active trace to stop");
    }

    const activeTrace = this.activeTrace;
    this.activeTrace = null;

    await activeTrace.session.transport.send("Tracing.end");
    await activeTrace.completion;
    activeTrace.unsubscribe();

    const outputPath = filePath ? path.resolve(filePath) : undefined;
    if (outputPath) {
      await fs.writeFile(outputPath, JSON.stringify({ traceEvents: activeTrace.events }, null, 2));
    }

    return {
      eventCount: activeTrace.events.length,
      filePath: outputPath,
    };
  }

  private handleEvent(activeTrace: ActiveTrace, message: CdpEventMessage): void {
    if (message.method === "Tracing.dataCollected") {
      const events = Array.isArray(message.params?.value) ? message.params.value : [];
      activeTrace.events.push(...events);
      return;
    }

    if (message.method === "Tracing.tracingComplete") {
      activeTrace.resolveCompletion();
    }
  }
}
