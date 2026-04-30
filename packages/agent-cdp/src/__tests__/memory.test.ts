import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemorySnapshotter } from "../memory.js";
import type { CdpEventMessage, CdpTransport, RuntimeSession, TargetDescriptor } from "../types.js";

class FakeMemoryTransport implements CdpTransport {
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

function createMemorySession(transport: CdpTransport): RuntimeSession {
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

describe("MemorySnapshotter", () => {
  it("captures heap snapshot chunks and writes them to disk", async () => {
    const transport = new FakeMemoryTransport();
    const snapshotter = new MemorySnapshotter();
    const filePath = path.join(os.tmpdir(), `agent-cdp-heap-${Date.now()}.heapsnapshot`);

    const capturePromise = snapshotter.capture(createMemorySession(transport), filePath);
    transport.emit({ method: "HeapProfiler.addHeapSnapshotChunk", params: { chunk: "{\"snapshot\":1}" } });
    transport.emit({
      method: "HeapProfiler.reportHeapSnapshotProgress",
      params: { finished: true },
    });

    const summary = await capturePromise;

    expect(summary.chunkCount).toBe(1);
    expect(summary.filePath).toBe(filePath);
    await expect(fs.readFile(filePath, "utf8")).resolves.toContain("snapshot");
  });
});
