import type { JsAllocationTimelineSession } from "./types.js";

export class JsAllocationTimelineStore {
  private sessions: JsAllocationTimelineSession[] = [];
  private nextId = 1;

  generateId(): string {
    return `jat_${this.nextId++}`;
  }

  add(session: JsAllocationTimelineSession): void {
    this.sessions.push(session);
  }

  get(sessionId: string): JsAllocationTimelineSession | undefined {
    return this.sessions.find((session) => session.sessionId === sessionId);
  }

  getLatest(): JsAllocationTimelineSession | undefined {
    return this.sessions.at(-1);
  }

  list(): JsAllocationTimelineSession[] {
    return [...this.sessions].reverse();
  }

  count(): number {
    return this.sessions.length;
  }
}
