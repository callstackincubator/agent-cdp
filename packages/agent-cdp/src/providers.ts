import { WebSocketCdpTransport } from "./transport.js";
import type { TargetDescriptor, TargetProvider } from "./types.js";

class ChromeTargetProvider implements TargetProvider {
  readonly kind = "chrome" as const;

  createTransport(target: TargetDescriptor): WebSocketCdpTransport {
    return new WebSocketCdpTransport(target);
  }
}

class ReactNativeTargetProvider implements TargetProvider {
  readonly kind = "react-native" as const;

  createTransport(target: TargetDescriptor): WebSocketCdpTransport {
    return new WebSocketCdpTransport(target);
  }
}

export function createTargetProviders(): TargetProvider[] {
  return [new ChromeTargetProvider(), new ReactNativeTargetProvider()];
}
