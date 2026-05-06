import type { RawTraceEvent } from "./types.js";

export interface NormalizedTrace {
  events: RawTraceEvent[];
  originTs: number;
}

export function normalizeTraceEvents(rawEvents: unknown[]): NormalizedTrace {
  const events = rawEvents.filter((event): event is RawTraceEvent => {
    return typeof event === "object" && event !== null;
  });

  const profileEvent = events.find((event) => {
    return event.name === "Profile" && isRecord(event.args) && isRecord(event.args.data);
  });
  const profileData = isRecord(profileEvent?.args) && isRecord(profileEvent.args.data) ? profileEvent.args.data : undefined;
  const originTs =
    typeof profileData?.startTime === "number"
      ? profileData.startTime
      : typeof events[0]?.ts === "number"
        ? events[0].ts
        : 0;

  return { events, originTs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
