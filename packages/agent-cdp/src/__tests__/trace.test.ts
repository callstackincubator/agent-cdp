import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { TraceRecorder } from "../trace.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeTraceTransport implements CdpTransport {
  private listener: ((message: CdpEventMessage) => void) | null = null;
  readonly sentMethods: string[] = [];

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  isConnected(): boolean {
    return true;
  }

  send(method: string): Promise<unknown> {
    this.sentMethods.push(method);
    return Promise.resolve(undefined);
  }

  onEvent(listener: (message: CdpEventMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(message: CdpEventMessage): void {
    this.listener?.(message);
  }
}

function createTraceSession(transport: CdpTransport): RuntimeSession {
  return {
    target: {
      id: "chrome:test:page-1",
      rawId: "page-1",
      title: "Example",
      kind: "chrome",
      description: "Test page",
      webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
      sourceUrl: "http://example.test",
    } satisfies TargetDescriptor,
    transport,
    metadata: {
      connectedAt: 0,
      clockCalibration: {
        state: "unavailable",
        hostRequestTimeMs: 0,
        hostResponseTimeMs: 0,
        hostMidpointTimeMs: 0,
        roundTripTimeMs: 0,
        reason: "not needed in test",
      },
    },
    ensureConnected: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

describe("TraceRecorder", () => {
  it("collects trace events and writes them to disk", async () => {
    const transport = new FakeTraceTransport();
    const recorder = new TraceRecorder();
    const filePath = path.join(os.tmpdir(), `agent-cdp-trace-${Date.now()}.json`);

    await recorder.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [{ name: "RunTask" }],
      },
    });

    const stopPromise = recorder.stop(filePath);
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const summary = await stopPromise;

    expect(summary.eventCount).toBe(1);
    expect(summary.filePath).toBe(filePath);
    await expect(fs.readFile(filePath, "utf8")).resolves.toContain("RunTask");
  });
});
