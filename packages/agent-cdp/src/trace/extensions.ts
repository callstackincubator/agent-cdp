import type { RawTraceEvent } from "./types.js";

export interface DevtoolsExtensionData {
  track?: string;
  trackGroup?: string;
  color?: string;
  tooltipText?: string;
  properties?: Array<[string, string]>;
  dataType?: string;
}

export interface ParsedExtensionData {
  devtools: DevtoolsExtensionData | null;
  userDetail: unknown;
}

export function parsePerformanceExtensionData(event: RawTraceEvent): ParsedExtensionData {
  const detail = readPerformanceDetail(event);
  if (!detail) {
    return { devtools: null, userDetail: null };
  }

  return parseDetailPayload(detail);
}

export function parseConsoleExtensionData(event: RawTraceEvent): ParsedExtensionData {
  const data = event.args?.data;
  if (!isRecord(data) || !data.track) {
    return { devtools: null, userDetail: null };
  }

  let userDetail: unknown = null;
  if (typeof data.devtools === "string") {
    try {
      userDetail = JSON.parse(data.devtools);
    } catch {
      userDetail = null;
    }
  }

  return {
    devtools: {
      dataType: "track-entry",
      track: String(data.track),
      trackGroup: data.trackGroup === undefined ? undefined : String(data.trackGroup),
      color: data.color === undefined ? undefined : String(data.color),
    },
    userDetail,
  };
}

function readPerformanceDetail(event: RawTraceEvent): string | null {
  const data = event.args?.data;
  if (!isRecord(data)) {
    return null;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  const beginEvent = data.beginEvent;
  if (!isRecord(beginEvent)) {
    return null;
  }

  const args = beginEvent.args;
  if (!isRecord(args) || typeof args.detail !== "string") {
    return null;
  }

  return args.detail;
}

function parseDetailPayload(detail: string): ParsedExtensionData {
  try {
    const parsed = JSON.parse(detail);
    if (!isRecord(parsed)) {
      return { devtools: null, userDetail: null };
    }

    const devtools = isRecord(parsed.devtools) ? normalizeDevtoolsObject(parsed.devtools) : null;
    const userDetail = { ...parsed };
    delete userDetail.devtools;
    return {
      devtools,
      userDetail: Object.keys(userDetail).length > 0 ? userDetail : null,
    };
  } catch {
    return { devtools: null, userDetail: null };
  }
}

function normalizeDevtoolsObject(devtools: Record<string, unknown>): DevtoolsExtensionData {
  return {
    dataType: typeof devtools.dataType === "string" ? devtools.dataType : undefined,
    track: typeof devtools.track === "string" ? devtools.track : undefined,
    trackGroup: typeof devtools.trackGroup === "string" ? devtools.trackGroup : undefined,
    color: typeof devtools.color === "string" ? devtools.color : undefined,
    tooltipText: typeof devtools.tooltipText === "string" ? devtools.tooltipText : undefined,
    properties: normalizeProperties(devtools.properties),
  };
}

function normalizeProperties(properties: unknown): Array<[string, string]> | undefined {
  if (!Array.isArray(properties)) {
    return undefined;
  }

  const normalized = properties.flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      return [];
    }
    return [[String(entry[0]), String(entry[1])] as [string, string]];
  });

  return normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
