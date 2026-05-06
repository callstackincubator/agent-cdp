import type { TraceSession } from "./types.js";

const MAX_TRACE_SESSIONS = 10;

export class TraceStore {
  private sessions: TraceSession[] = [];
  private nextId = 1;

  generateId(): string {
    return `tr_${this.nextId++}`;
  }

  add(session: TraceSession): void {
    this.sessions.push(session);
    if (this.sessions.length > MAX_TRACE_SESSIONS) {
      this.sessions.splice(0, this.sessions.length - MAX_TRACE_SESSIONS);
    }
  }

  get(sessionId: string): TraceSession | undefined {
    return this.sessions.find((session) => session.sessionId === sessionId);
  }

  getLatest(): TraceSession | undefined {
    return this.sessions.at(-1);
  }

  list(): TraceSession[] {
    return [...this.sessions].reverse();
  }

  count(): number {
    return this.sessions.length;
  }
}
