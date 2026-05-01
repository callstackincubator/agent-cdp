import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

import type { CdpProfile, SymbolicationFailure } from "./types.js";

export interface OriginalPosition {
  source: string;
  line: number;   // 0-based
  column: number; // 0-based
  name: string | null;
}

export interface SymbolicationResult {
  bundleUrls: string[];
  resolvedSourceMapUrls: string[];
  failures: SymbolicationFailure[];
  totalMappableFrames: number;
  symbolicatedCount: number;
  isBundleUrl(url: string): boolean;
  getOriginalPosition(url: string, line: number, column: number): OriginalPosition | null;
}

// Process-level caches: avoids re-fetching across consecutive profile sessions
const bundleUrlCache = new Map<string, string | null>();     // bundle URL → sourceMappingURL | null
const sourceMapCache = new Map<string, TraceMap | null>();   // source map URL → parsed | null

export function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export async function resolveSourceMaps(profile: CdpProfile): Promise<SymbolicationResult> {
  const failures: SymbolicationFailure[] = [];
  const tracers = new Map<string, TraceMap>();         // bundle URL → tracer
  const bundleUrls: string[] = [];
  const resolvedSourceMapUrls: string[] = [];

  // Collect unique HTTP(S) URLs from frames
  const candidateUrls = new Set<string>();
  for (const node of profile.nodes) {
    const { url } = node.callFrame;
    if (isHttpUrl(url)) candidateUrls.add(url);
  }

  for (const url of candidateUrls) {
    // Step 1: find sourceMappingURL comment in the bundle
    let sourceMappingUrl = bundleUrlCache.get(url);
    if (sourceMappingUrl === undefined) {
      try {
        sourceMappingUrl = await fetchSourceMappingUrl(url);
      } catch (err) {
        sourceMappingUrl = null;
        failures.push({ bundleUrl: url, reason: `Bundle fetch failed: ${errorMessage(err)}` });
      }
      bundleUrlCache.set(url, sourceMappingUrl);
    }

    if (!sourceMappingUrl) continue;  // not a bundle or already recorded failure

    bundleUrls.push(url);

    // Step 2: handle inline source maps
    if (sourceMappingUrl.startsWith("data:")) {
      const cacheKey = sourceMappingUrl.slice(0, 64);  // truncate for key
      if (!sourceMapCache.has(cacheKey)) {
        try {
          sourceMapCache.set(cacheKey, parseInlineSourceMap(sourceMappingUrl));
        } catch (err) {
          sourceMapCache.set(cacheKey, null);
          failures.push({ bundleUrl: url, reason: `Inline source map parse failed: ${errorMessage(err)}` });
        }
      }
      const tracer = sourceMapCache.get(cacheKey);
      if (tracer) {
        tracers.set(url, tracer);
        resolvedSourceMapUrls.push("(inline)");
      }
      continue;
    }

    // Step 3: resolve relative URL and fetch external source map
    const resolvedUrl = resolveRelativeUrl(sourceMappingUrl, url);
    resolvedSourceMapUrls.push(resolvedUrl);

    if (!sourceMapCache.has(resolvedUrl)) {
      try {
        sourceMapCache.set(resolvedUrl, await fetchAndParseSourceMap(resolvedUrl));
      } catch (err) {
        sourceMapCache.set(resolvedUrl, null);
        failures.push({ bundleUrl: url, reason: `Source map fetch failed: ${errorMessage(err)}` });
      }
    }

    const tracer = sourceMapCache.get(resolvedUrl);
    if (tracer) {
      tracers.set(url, tracer);
    } else if (!failures.some((f) => f.bundleUrl === url)) {
      failures.push({ bundleUrl: url, reason: "Source map unavailable (previous fetch failed)" });
    }
  }

  // Compute coverage over mappable frames (frames whose URL is a bundle URL with a tracer)
  const bundleUrlSet = new Set(bundleUrls);
  let totalMappableFrames = 0;
  let symbolicatedCount = 0;

  for (const node of profile.nodes) {
    const { url, lineNumber, columnNumber } = node.callFrame;
    if (!bundleUrlSet.has(url)) continue;
    totalMappableFrames++;
    const tracer = tracers.get(url);
    if (tracer && safeOriginalPosition(tracer, lineNumber, columnNumber)) symbolicatedCount++;
  }

  return {
    bundleUrls,
    resolvedSourceMapUrls,
    failures,
    totalMappableFrames,
    symbolicatedCount,
    isBundleUrl: (url: string) => bundleUrlSet.has(url),
    getOriginalPosition(url: string, line: number, column: number): OriginalPosition | null {
      const tracer = tracers.get(url);
      return tracer ? safeOriginalPosition(tracer, line, column) : null;
    },
  };
}

function safeOriginalPosition(tracer: TraceMap, line: number, column: number): OriginalPosition | null {
  try {
    // @jridgewell/trace-mapping uses 1-based lines
    const pos = originalPositionFor(tracer, { line: line + 1, column });
    if (!pos.source) return null;
    return {
      source: pos.source,
      line: (pos.line ?? 1) - 1,  // back to 0-based
      column: pos.column ?? 0,
      name: pos.name ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchSourceMappingUrl(bundleUrl: string): Promise<string | null> {
  // Fetch only the tail of the bundle — the sourceMappingURL comment is always at the end
  let text: string;
  const tailResponse = await fetch(bundleUrl, {
    headers: { Range: "bytes=-8192" },
    signal: AbortSignal.timeout(15_000),
  });

  if (tailResponse.status === 416) {
    // Server doesn't support range requests — fall back to full fetch
    const fullResponse = await fetch(bundleUrl, { signal: AbortSignal.timeout(30_000) });
    if (!fullResponse.ok) throw new Error(`HTTP ${fullResponse.status}`);
    text = await fullResponse.text();
  } else if (!tailResponse.ok) {
    throw new Error(`HTTP ${tailResponse.status}`);
  } else {
    text = await tailResponse.text();
  }

  const match = /\/\/[#@]\s*sourceMappingURL=([^\s]+)/.exec(text);
  return match ? match[1].trim() : null;
}

function resolveRelativeUrl(sourceMapUrl: string, bundleUrl: string): string {
  if (isHttpUrl(sourceMapUrl)) return sourceMapUrl;
  try {
    return new URL(sourceMapUrl, bundleUrl).href;
  } catch {
    return sourceMapUrl;
  }
}

async function fetchAndParseSourceMap(url: string): Promise<TraceMap> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  try {
    return new TraceMap(JSON.parse(text));
  } catch {
    throw new Error("Source map is not valid JSON");
  }
}

function parseInlineSourceMap(dataUrl: string): TraceMap {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Malformed data URL");
  const header = dataUrl.slice(5, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  const json = header.includes("base64")
    ? Buffer.from(data, "base64").toString("utf-8")
    : decodeURIComponent(data);
  return new TraceMap(JSON.parse(json));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
