import type { AnalyzedSnapshot } from "./types.js";

export class HeapSnapshotStore {
  private snapshots: AnalyzedSnapshot[] = [];
  private nextCounter = 1;

  generateId(): string {
    return `ms_${this.nextCounter++}`;
  }

  add(snapshot: AnalyzedSnapshot): void {
    this.snapshots.push(snapshot);
  }

  get(snapshotId: string): AnalyzedSnapshot | undefined {
    return this.snapshots.find((s) => s.snapshotId === snapshotId);
  }

  getLatest(): AnalyzedSnapshot | undefined {
    return this.snapshots.at(-1);
  }

  list(): AnalyzedSnapshot[] {
    return [...this.snapshots].reverse();
  }

  count(): number {
    return this.snapshots.length;
  }
}
