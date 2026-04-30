import fs from "node:fs/promises";
import path from "node:path";

import type { CdpEventMessage, MemorySnapshotSummary, RuntimeSession } from "./types.js";

interface ActiveSnapshot {
  chunks: string[];
  unsubscribe: () => void;
  resolveCompletion: () => void;
  completion: Promise<void>;
}

export class MemorySnapshotter {
  async capture(session: RuntimeSession, filePath: string): Promise<MemorySnapshotSummary> {
    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    const activeSnapshot: ActiveSnapshot = {
      chunks: [],
      unsubscribe: () => undefined,
      resolveCompletion,
      completion,
    };

    activeSnapshot.unsubscribe = session.transport.onEvent((message) => {
      this.handleEvent(activeSnapshot, message);
    });

    try {
      await session.transport.send("HeapProfiler.enable");
      await session.transport.send("HeapProfiler.takeHeapSnapshot", { reportProgress: true });
      await activeSnapshot.completion;
    } finally {
      activeSnapshot.unsubscribe();
    }

    const outputPath = path.resolve(filePath);
    await fs.writeFile(outputPath, activeSnapshot.chunks.join(""));

    return {
      chunkCount: activeSnapshot.chunks.length,
      filePath: outputPath,
    };
  }

  private handleEvent(activeSnapshot: ActiveSnapshot, message: CdpEventMessage): void {
    if (message.method === "HeapProfiler.addHeapSnapshotChunk") {
      const chunk = typeof message.params?.chunk === "string" ? message.params.chunk : "";
      activeSnapshot.chunks.push(chunk);
      return;
    }

    if (message.method === "HeapProfiler.reportHeapSnapshotProgress" && message.params?.finished === true) {
      activeSnapshot.resolveCompletion();
    }
  }
}
