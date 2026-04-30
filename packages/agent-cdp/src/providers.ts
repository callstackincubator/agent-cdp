import { fetchJsonTargets, mapChromeTarget, mapReactNativeTarget } from "./discovery.js";
import { WebSocketCdpTransport } from "./transport.js";
import type { TargetDescriptor, TargetProvider } from "./types.js";

class ChromeTargetProvider implements TargetProvider {
  readonly kind = "chrome" as const;

  async listTargets(baseUrl: string): Promise<TargetDescriptor[]> {
    const targets = await fetchJsonTargets<{
      id: string;
      title?: string;
      description?: string;
      type?: string;
      devtoolsFrontendUrl?: string;
      webSocketDebuggerUrl?: string;
    }>(baseUrl);

    return targets
      .map((target) => mapChromeTarget(baseUrl, target))
      .filter((target): target is TargetDescriptor => target !== null);
  }

  createTransport(target: TargetDescriptor): WebSocketCdpTransport {
    return new WebSocketCdpTransport(target);
  }
}

class ReactNativeTargetProvider implements TargetProvider {
  readonly kind = "react-native" as const;

  async listTargets(baseUrl: string): Promise<TargetDescriptor[]> {
    const targets = await fetchJsonTargets<{
      id: string;
      title?: string;
      description?: string;
      devtoolsFrontendUrl?: string;
      webSocketDebuggerUrl?: string;
      appId?: string;
      reactNative?: {
        logicalDeviceId: string;
        capabilities?: {
          nativePageReloads?: boolean;
          nativeSourceCodeFetching?: boolean;
          supportsMultipleDebuggers?: boolean;
        };
      };
    }>(baseUrl);

    return targets
      .map((target) => mapReactNativeTarget(baseUrl, target))
      .filter((target): target is TargetDescriptor => target !== null);
  }

  createTransport(target: TargetDescriptor): WebSocketCdpTransport {
    return new WebSocketCdpTransport(target);
  }
}

export function createTargetProviders(): TargetProvider[] {
  return [new ChromeTargetProvider(), new ReactNativeTargetProvider()];
}
