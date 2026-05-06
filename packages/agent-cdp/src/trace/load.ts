import type { RawTraceEvent } from "./types.js";

export function normalizeTraceEvents(rawEvents: unknown[]): RawTraceEvent[] {
  return rawEvents.filter((event): event is RawTraceEvent => {
    return typeof event === "object" && event !== null;
  });
}
