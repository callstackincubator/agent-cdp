import type { JsAllocationSession } from "./types.js";

export class JsAllocationStore {
  private sessions: JsAllocationSession[] = [];
  private nextId = 1;

  generateId(): string {
    return `ja_${this.nextId++}`;
  }

  add(session: JsAllocationSession): void {
    this.sessions.push(session);
  }

  get(sessionId: string): JsAllocationSession | undefined {
    return this.sessions.find((session) => session.sessionId === sessionId);
  }

  getLatest(): JsAllocationSession | undefined {
    return this.sessions.at(-1);
  }

  list(): JsAllocationSession[] {
    return [...this.sessions].reverse();
  }

  count(): number {
    return this.sessions.length;
  }
}
