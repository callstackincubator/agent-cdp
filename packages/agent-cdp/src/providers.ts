import type { TargetDescriptor, TargetProvider } from "./types.js";

class ChromeTargetProvider implements TargetProvider {
  readonly name = "chrome";

  async listTargets(): Promise<TargetDescriptor[]> {
    return [];
  }
}

class ReactNativeTargetProvider implements TargetProvider {
  readonly name = "react-native";

  async listTargets(): Promise<TargetDescriptor[]> {
    return [];
  }
}

export function createTargetProviders(): TargetProvider[] {
  return [new ChromeTargetProvider(), new ReactNativeTargetProvider()];
}
