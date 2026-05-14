import { NETWORK_LIVE_BUFFER_LIMIT } from "./types.js";
import type { NetworkRequest, NetworkSession, NetworkSessionListEntry, NetworkStatusResult } from "./types.js";

interface ActiveNetworkSession extends NetworkSession {
  requestIds: Set<string>;
}

export class NetworkStore {
  private readonly liveRequests: NetworkRequest[] = [];
  private readonly sessions: NetworkSession[] = [];
  private activeSession: ActiveNetworkSession | null = null;
  private nextSessionId = 1;
  private nextRequestId = 1;

  generateRequestId(): string {
    return `req_${this.nextRequestId++}`;
  }

  startSession(name?: string, preserveAcrossNavigation = false): NetworkSession {
    if (this.activeSession) {
      throw new Error(`Network session ${this.activeSession.id} is already active`);
    }

    this.activeSession = {
      id: `net_${this.nextSessionId++}`,
      name,
      startedAt: Date.now(),
      preserveAcrossNavigation,
      requests: [],
      requestIds: new Set<string>(),
    };

    return this.activeSession;
  }

  stopSession(): NetworkSession {
    if (!this.activeSession) {
      throw new Error("No active network session. Run network start first.");
    }

    const finalized: NetworkSession = {
      id: this.activeSession.id,
      name: this.activeSession.name,
      startedAt: this.activeSession.startedAt,
      stoppedAt: Date.now(),
      preserveAcrossNavigation: this.activeSession.preserveAcrossNavigation,
      requests: [...this.activeSession.requests],
    };
    this.sessions.push(finalized);
    this.activeSession = null;
    return finalized;
  }

  discardActiveSession(): void {
    this.activeSession = null;
  }

  record(request: NetworkRequest, isNew: boolean): void {
    if (isNew) {
      this.liveRequests.push(request);
      while (this.liveRequests.length > NETWORK_LIVE_BUFFER_LIMIT) {
        this.liveRequests.shift();
      }
    }

    if (!this.activeSession) {
      return;
    }

    if (!this.activeSession.requestIds.has(request.id)) {
      request.source = "session";
      request.sessionId = this.activeSession.id;
      this.activeSession.requestIds.add(request.id);
      this.activeSession.requests.push(request);
    }
  }

  handleNavigation(): void {
    if (!this.activeSession || this.activeSession.preserveAcrossNavigation) {
      return;
    }

    this.activeSession.requests = [];
    this.activeSession.requestIds.clear();
  }

  getLiveRequests(): NetworkRequest[] {
    return [...this.liveRequests].reverse();
  }

  getActiveSession(): NetworkSession | null {
    if (!this.activeSession) {
      return null;
    }

    return {
      id: this.activeSession.id,
      name: this.activeSession.name,
      startedAt: this.activeSession.startedAt,
      preserveAcrossNavigation: this.activeSession.preserveAcrossNavigation,
      requests: [...this.activeSession.requests],
    };
  }

  getSession(sessionId: string): NetworkSession | undefined {
    if (this.activeSession?.id === sessionId) {
      return this.getActiveSession() || undefined;
    }
    return this.sessions.find((session) => session.id === sessionId);
  }

  getLatestStoredSession(): NetworkSession | undefined {
    return this.sessions.at(-1);
  }

  getLatestSession(): NetworkSession | undefined {
    return this.getActiveSession() || this.getLatestStoredSession();
  }

  listSessions(limit = 20, offset = 0): NetworkSessionListEntry[] {
    const entries: NetworkSessionListEntry[] = [];
    if (this.activeSession) {
      entries.push({
        id: this.activeSession.id,
        name: this.activeSession.name,
        startedAt: this.activeSession.startedAt,
        preserveAcrossNavigation: this.activeSession.preserveAcrossNavigation,
        requestCount: this.activeSession.requests.length,
        active: true,
      });
    }

    for (const session of [...this.sessions].reverse()) {
      entries.push({
        id: session.id,
        name: session.name,
        startedAt: session.startedAt,
        stoppedAt: session.stoppedAt,
        preserveAcrossNavigation: session.preserveAcrossNavigation,
        requestCount: session.requests.length,
        active: false,
      });
    }

    return entries.slice(offset, offset + limit);
  }

  getStatus(attached: boolean): NetworkStatusResult {
    return {
      attached,
      liveRequestCount: this.liveRequests.length,
      liveBufferLimit: NETWORK_LIVE_BUFFER_LIMIT,
      activeSession: this.activeSession
        ? {
            id: this.activeSession.id,
            name: this.activeSession.name,
            startedAt: this.activeSession.startedAt,
            preserveAcrossNavigation: this.activeSession.preserveAcrossNavigation,
            requestCount: this.activeSession.requests.length,
          }
        : null,
      storedSessionCount: this.sessions.length,
    };
  }
}
