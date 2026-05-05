import type { DiscoveryOptions, TargetDescriptor } from "./types.js";

export const DEFAULT_DISCOVERY_URLS = [
  "http://127.0.0.1:9222",
  "http://127.0.0.1:9229",
  "http://127.0.0.1:8081",
] as const;

interface ChromeJsonTarget {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl?: string;
}

interface ReactNativeJsonTarget extends ChromeJsonTarget {
  appId?: string;
  reactNative?: {
    logicalDeviceId: string;
    capabilities?: {
      nativePageReloads?: boolean;
      nativeSourceCodeFetching?: boolean;
      supportsMultipleDebuggers?: boolean;
    };
  };
}

export function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function normalizeDiscoveryUrl(url: string): string {
  const normalized = normalizeBaseUrl(url.trim());
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized) ? normalized : `http://${normalized}`;
}

export function encodeTargetSource(url: string): string {
  const normalized = normalizeDiscoveryUrl(url);
  const value = normalized.startsWith("http://") ? normalized.slice("http://".length) : normalized;
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeTargetSource(source: string): string {
  const decoded = Buffer.from(source, "base64url").toString("utf8");
  return decoded.includes("://") ? decoded : `http://${decoded}`;
}

export function buildTargetId(kind: TargetDescriptor["kind"], sourceUrl: string, rawId: string): string {
  return `${kind}:${encodeTargetSource(sourceUrl)}:${rawId}`;
}

export function parseTargetId(id: string): {
  kind: TargetDescriptor["kind"];
  encodedSource: string;
  rawId: string;
  sourceUrl: string;
} {
  const firstSeparator = id.indexOf(":");
  const secondSeparator = id.indexOf(":", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1 || secondSeparator === id.length - 1) {
    throw new Error(`Invalid target id: ${id}`);
  }

  const kind = id.slice(0, firstSeparator);
  if (kind !== "chrome" && kind !== "react-native") {
    throw new Error(`Invalid target id: ${id}`);
  }

  const encodedSource = id.slice(firstSeparator + 1, secondSeparator);
  const rawId = id.slice(secondSeparator + 1);

  try {
    return {
      kind,
      encodedSource,
      rawId,
      sourceUrl: normalizeDiscoveryUrl(decodeTargetSource(encodedSource)),
    };
  } catch {
    throw new Error(`Invalid target id: ${id}`);
  }
}

export function getDiscoveryUrl(options: DiscoveryOptions): string | null {
  return options.url ? normalizeDiscoveryUrl(options.url) : null;
}

export function getDiscoveryUrls(options: DiscoveryOptions): string[] {
  const explicitUrl = getDiscoveryUrl(options);
  if (explicitUrl) {
    return [explicitUrl];
  }

  return [...DEFAULT_DISCOVERY_URLS];
}

export function mapChromeTarget(sourceUrl: string, target: ChromeJsonTarget): TargetDescriptor | null {
  if (!target.webSocketDebuggerUrl) {
    return null;
  }

  return {
    id: buildTargetId("chrome", sourceUrl, target.id),
    rawId: target.id,
    title: target.title || target.id,
    kind: "chrome",
    description: target.description || target.type || "Chrome target",
    devtoolsFrontendUrl: target.devtoolsFrontendUrl,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    sourceUrl: normalizeBaseUrl(sourceUrl),
  };
}

export function mapReactNativeTarget(sourceUrl: string, target: ReactNativeJsonTarget): TargetDescriptor | null {
  if (!target.webSocketDebuggerUrl) {
    return null;
  }

  return {
    id: buildTargetId("react-native", sourceUrl, target.id),
    rawId: target.id,
    title: target.title || target.id,
    kind: "react-native",
    description: target.description || target.appId || "React Native target",
    appId: target.appId,
    devtoolsFrontendUrl: target.devtoolsFrontendUrl,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    sourceUrl: normalizeBaseUrl(sourceUrl),
    reactNative: target.reactNative
      ? {
          logicalDeviceId: target.reactNative.logicalDeviceId,
          capabilities: target.reactNative.capabilities || {},
        }
      : undefined,
  };
}

export async function fetchJsonTargets<T>(baseUrl: string): Promise<T[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/json/list`);
  if (!response.ok) {
    throw new Error(`Target discovery failed for ${baseUrl}: HTTP ${response.status}`);
  }

  return (await response.json()) as T[];
}

export async function discoverTargets(options: DiscoveryOptions): Promise<TargetDescriptor[]> {
  const urls = getDiscoveryUrls(options);
  if (options.url) {
    const targets = await fetchJsonTargets<ReactNativeJsonTarget>(urls[0]);
    return targets
      .map((target) => {
        if (target.reactNative) {
          return mapReactNativeTarget(urls[0], target);
        }

        return mapChromeTarget(urls[0], target);
      })
      .filter((target): target is TargetDescriptor => target !== null);
  }

  const results = await Promise.allSettled(urls.map((url) => fetchJsonTargets<ReactNativeJsonTarget>(url)));

  return results.flatMap((result, index) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    const url = urls[index];
    return result.value
      .map((target) => {
        if (target.reactNative) {
          return mapReactNativeTarget(url, target);
        }

        return mapChromeTarget(url, target);
      })
      .filter((target): target is TargetDescriptor => target !== null);
  });
}
