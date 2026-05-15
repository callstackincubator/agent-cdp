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
            name: "TimeStamp",
            cat: "devtools.timeline",
            ph: "I",
            ts: 15_000,
            args: {
              data: {
                name: "ts-start",
                message: "ts-start",
              },
            },
          },
          {
            name: "TimeStamp",
            cat: "devtools.timeline",
            ph: "I",
            ts: 18_000,
            args: {
              data: {
                name: "ts-range",
                message: "ts-range",
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

  it("parses structured performance detail payloads for custom tracks", async () => {
    const transport = new FakeTraceTransport();
    const manager = new TraceManager();

    await manager.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [
          {
            name: "Structured detail measure",
            cat: "blink.user_timing",
            ph: "X",
            ts: 5_000,
            dur: 4_000,
            args: {
              data: {
                detail: {
                  devtools: {
                    track: "Structured Track",
                    trackGroup: "Structured Group",
                    color: "primary-dark",
                    tooltipText: "Structured tooltip",
                    properties: [["Kind", "object"]],
                  },
                  stage: "measure",
                },
              },
            },
          },
        ],
      },
    });

    const stopPromise = manager.stop();
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const stop = await stopPromise;

    const entries = manager.getEntries({ sessionId: stop.sessionId, track: "Structured Track", limit: 10, offset: 0 });
    expect(entries.total).toBe(1);
    expect(entries.items[0]?.trackGroup).toBe("Structured Group");
    expect(entries.items[0]?.color).toBe("primary-dark");

    const entry = manager.getEntry(entries.items[0]!.entryId, stop.sessionId);
    expect(entry.tooltipText).toBe("Structured tooltip");
    expect(entry.properties).toEqual([["Kind", "object"]]);
    expect(entry.userDetail).toEqual({ stage: "measure" });
  });

  it("parses raw blink.user_timing detail payloads from top-level args", async () => {
    const transport = new FakeTraceTransport();
    const manager = new TraceManager();

    await manager.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [
          {
            name: "image-processing",
            cat: "blink.user_timing",
            id: "0x4",
            ph: "b",
            ts: 13_704_695_270,
            args: {
              detail:
                '{"devtools":{"properties":[["Filter","Gaussian Blur"]],"tooltipText":"Image processed successfully","color":"tertiary-dark","trackGroup":"Demo","track":"Image Processing"}}',
            },
          },
          {
            name: "image-processing",
            cat: "blink.user_timing",
            id: "0x4",
            ph: "e",
            ts: 13_704_700_270,
            args: {
              detail:
                '{"devtools":{"properties":[["Filter","Gaussian Blur"]],"tooltipText":"Image processed successfully","color":"tertiary-dark","trackGroup":"Demo","track":"Image Processing"}}',
            },
          },
        ],
      },
    });

    const stopPromise = manager.stop();
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const stop = await stopPromise;

    const entries = manager.getEntries({ sessionId: stop.sessionId, track: "Image Processing", limit: 10, offset: 0 });
    expect(entries.total).toBe(1);
    expect(entries.items[0]?.trackGroup).toBe("Demo");
    expect(entries.items[0]?.color).toBe("tertiary-dark");
    expect(entries.items[0]?.tooltipText).toBe("Image processed successfully");
    expect(entries.items[0]?.properties).toEqual([["Filter", "Gaussian Blur"]]);
  });

  it("falls back to begin-event metadata for paired measures and parses devtools timeline timestamps", async () => {
    const transport = new FakeTraceTransport();
    const manager = new TraceManager();

    await manager.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [
          {
            name: "image-processing",
            cat: "blink.user_timing",
            id: "0x4",
            ph: "b",
            ts: 10_000,
            args: {
              detail:
                '{"devtools":{"properties":[["Filter","Gaussian Blur"]],"tooltipText":"Image processed successfully","color":"tertiary-dark","trackGroup":"Demo","track":"Image Processing"}}',
            },
          },
          {
            name: "image-processing",
            cat: "blink.user_timing",
            id: "0x4",
            ph: "e",
            ts: 12_000,
            args: {},
          },
          {
            name: "TimeStamp",
            cat: "devtools.timeline",
            ph: "I",
            ts: 15_000,
            args: {
              data: {
                name: "console-range",
                message: "console-range",
                start: 14_000,
                end: 18_000,
                track: "Console Track",
                trackGroup: "Demo",
                color: "primary",
              },
            },
          },
        ],
      },
    });

    const stopPromise = manager.stop();
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const stop = await stopPromise;

    const customMeasureEntries = manager.getEntries({ sessionId: stop.sessionId, track: "Image Processing", limit: 10, offset: 0 });
    expect(customMeasureEntries.total).toBe(1);
    expect(customMeasureEntries.items[0]?.trackGroup).toBe("Demo");

    const customStampEntries = manager.getEntries({ sessionId: stop.sessionId, track: "Console Track", type: "stamp", limit: 10, offset: 0 });
    expect(customStampEntries.total).toBe(1);
    expect(customStampEntries.items[0]?.trackGroup).toBe("Demo");
    expect(customStampEntries.items[0]?.durationMs).toBe(4);
  });

  it("treats tiny numeric timestamp boundaries as registration markers", async () => {
    const transport = new FakeTraceTransport();
    const manager = new TraceManager();

    await manager.start(createTraceSession(transport));
    transport.emit({
      method: "Tracing.dataCollected",
      params: {
        value: [
          {
            name: "TimeStamp",
            cat: "devtools.timeline",
            ph: "I",
            ts: 13_704_644_808,
            args: {
              data: {
                name: "Blocking Track",
                message: "Blocking Track",
                start: 3,
                end: 3,
                track: "Blocking",
                trackGroup: "Scheduler ⚛",
                color: "primary-light",
              },
            },
          },
        ],
      },
    });

    const stopPromise = manager.stop();
    transport.emit({ method: "Tracing.tracingComplete", params: {} });
    const stop = await stopPromise;

    const tracks = manager.getTracks({ sessionId: stop.sessionId, limit: 10, offset: 0 });
    expect(tracks.items[0]?.name).toBe("Blocking");
    expect(tracks.items[0]?.activeMs).toBe(0);
    expect(tracks.items[0]?.startMs).toBe(0);
    expect(tracks.items[0]?.endMs).toBe(0);
    expect(tracks.items[0]?.entryCount).toBe(1);
  });
});
