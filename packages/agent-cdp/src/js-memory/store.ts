import type { JsMemorySample } from "./types.js";

export class JsMemoryStore {
  private samples: JsMemorySample[] = [];
  private nextCounter = 1;

  generateId(): string {
    return `jm_${this.nextCounter++}`;
  }

  add(sample: JsMemorySample): void {
    this.samples.push(sample);
  }

  get(sampleId: string): JsMemorySample | undefined {
    return this.samples.find((s) => s.sampleId === sampleId);
  }

  getLatest(): JsMemorySample | undefined {
    return this.samples.at(-1);
  }

  list(): JsMemorySample[] {
    return [...this.samples].reverse();
  }

  all(): JsMemorySample[] {
    return [...this.samples];
  }

  count(): number {
    return this.samples.length;
  }
}
