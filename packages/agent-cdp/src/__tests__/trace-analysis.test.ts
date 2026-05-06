import { TraceManager } from "../trace/index.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeTraceTransport implements CdpTransport {
  private listener: ((message: CdpEventMessage) => void) | null = null;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  isConnected(): boolean {
    return true;
  }

  send(): Promise<unknown> {
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
    ensureConnected: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

describe("TraceManager", () => {
  it("stores analyzed sessions and exposes filtered entries and tracks", async () => {
    const transport = new FakeTraceTransport();
    const manager = new TraceManager();

    await manager.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [
          {
            name: "Image Processing Complete",
            cat: "blink.user_timing",
            ph: "X",
            ts: 1_000,
            dur: 5_000,
            args: {
              data: {
                beginEvent: {
                  args: {
                    detail: JSON.stringify({
                      devtools: {
                        track: "Image Processing",
                        trackGroup: "My Group",
                        color: "tertiary-dark",
                        tooltipText: "Image processed successfully",
                        properties: [["Filter", "Gaussian Blur"]],
                      },
                    }),
                  },
                },
              },
            },
          },
          {
            name: "Render pass",
            cat: "blink.user_timing",
            ph: "X",
            ts: 8_000,
            dur: 2_000,
            args: { data: {} },
          },
          {
            name: "Hydration done",
            cat: "blink.user_timing",
            ph: "R",
            ts: 12_000,
            args: {
              data: {
                detail: JSON.stringify({ stage: "hydrate" }),
              },
            },
          },
          {
            name: "console.timeStamp",
            cat: "blink.console",
            ph: "I",
            ts: 15_000,
            args: {
              data: {
                name: "ts-start",
              },
            },
          },
          {
            name: "console.timeStamp",
            cat: "blink.console",
            ph: "I",
            ts: 18_000,
            args: {
              data: {
                name: "ts-range",
                start: "ts-start",
                track: "Console Track",
                trackGroup: "Console Group",
                color: "secondary",
              },
            },
          },
        ],
      },
    });

    const stopPromise = manager.stop();
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const stop = await stopPromise;

    expect(stop.eventCount).toBe(5);
    expect(stop.entryCount).toBe(5);
    expect(stop.trackCount).toBe(3);

    const summary = manager.getSummary(stop.sessionId);
    expect(summary.entryCounts.measure).toBe(2);
    expect(summary.entryCounts.mark).toBe(1);
    expect(summary.entryCounts.stamp).toBe(2);

    const tracks = manager.getTracks({ sessionId: stop.sessionId, limit: 10, offset: 0 });
    expect(tracks.items.map((track) => track.name)).toEqual(expect.arrayContaining(["Timings", "Image Processing", "Console Track"]));

    const entries = manager.getEntries({ sessionId: stop.sessionId, track: "Image Processing", limit: 10, offset: 0 });
    expect(entries.total).toBe(1);
    expect(entries.items[0]?.name).toBe("Image Processing Complete");
    expect(entries.items[0]?.trackGroup).toBe("My Group");

    const consoleEntries = manager.getEntries({ sessionId: stop.sessionId, type: "stamp", track: "Console Track", limit: 10, offset: 0 });
    expect(consoleEntries.items[0]?.durationMs).toBe(3);

    const entry = manager.getEntry(entries.items[0]!.entryId, stop.sessionId);
    expect(entry.properties).toEqual([["Filter", "Gaussian Blur"]]);
    expect(entry.tooltipText).toBe("Image processed successfully");
  });
});
