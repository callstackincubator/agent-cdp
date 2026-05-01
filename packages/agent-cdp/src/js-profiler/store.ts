import type { JsProfileSession } from "./types.js";

export class JsProfileStore {
  private sessions: JsProfileSession[] = [];
  private nextId = 1;

  generateId(): string {
    return `js_${this.nextId++}`;
  }

  add(session: JsProfileSession): void {
    this.sessions.push(session);
  }

  get(sessionId: string): JsProfileSession | undefined {
    return this.sessions.find((s) => s.sessionId === sessionId);
  }

  getLatest(): JsProfileSession | undefined {
    return this.sessions.at(-1);
  }

  list(): JsProfileSession[] {
    return [...this.sessions].reverse();
  }

  count(): number {
    return this.sessions.length;
  }
}
