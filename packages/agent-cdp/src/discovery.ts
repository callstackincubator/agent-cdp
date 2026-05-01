import type { DiscoveryOptions, TargetDescriptor } from "./types.js";

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

export function buildTargetId(kind: TargetDescriptor["kind"], sourceUrl: string, rawId: string): string {
  return `${kind}:${encodeURIComponent(normalizeBaseUrl(sourceUrl))}:${rawId}`;
}

export function getDiscoveryUrl(options: DiscoveryOptions): string | null {
  return options.url ? normalizeBaseUrl(options.url) : null;
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
  const url = getDiscoveryUrl(options);
  if (!url) {
    return [];
  }

  const targets = await fetchJsonTargets<ReactNativeJsonTarget>(url);
  return targets
    .map((target) => {
      if (target.reactNative) {
        return mapReactNativeTarget(url, target);
      }

      return mapChromeTarget(url, target);
    })
    .filter((target): target is TargetDescriptor => target !== null);
}
