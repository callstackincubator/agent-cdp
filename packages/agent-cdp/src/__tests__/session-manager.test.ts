import { SessionManager } from "../session-manager.js";
import type { CdpEventMessage, CdpTransport, TargetDescriptor, TargetProvider } from "../types.js";

class FakeTransport implements CdpTransport {
  connected = false;

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  onEvent(_listener: (message: CdpEventMessage) => void): () => void {
    return () => undefined;
  }
}

class FakeProvider implements TargetProvider {
  readonly kind = "chrome" as const;

  async listTargets(): Promise<TargetDescriptor[]> {
    return [
      {
        id: "chrome:test:page-1",
        rawId: "page-1",
        title: "Example",
        kind: "chrome",
        description: "Test page",
        webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
        sourceUrl: "http://example.test",
      },
    ];
  }

  createTransport(): CdpTransport {
    return new FakeTransport();
  }
}

describe("SessionManager", () => {
  it("lists targets from configured providers", async () => {
    const manager = new SessionManager([new FakeProvider()]);
    await expect(manager.listTargets({ chromeUrl: "http://example.test" })).resolves.toHaveLength(1);
  });

  it("selects and clears a target", async () => {
    const manager = new SessionManager([new FakeProvider()]);
    await expect(manager.selectTarget("chrome:test:page-1", { chromeUrl: "http://example.test" })).resolves.toMatchObject({
      title: "Example",
    });
    expect(manager.getSessionState()).toBe("connected");
    await manager.clearTarget();
    expect(manager.getSelectedTarget()).toBeNull();
    expect(manager.getSessionState()).toBe("disconnected");
  });

  it("reconnects react native targets by logical device id", async () => {
    class FakeReactNativeProvider implements TargetProvider {
      readonly kind = "react-native" as const;
      private attempt = 0;

      async listTargets(): Promise<TargetDescriptor[]> {
        this.attempt += 1;
        return [
          {
            id: `react-native:test:page-${this.attempt}`,
            rawId: `page-${this.attempt}`,
            title: "React Native Experimental",
            kind: "react-native",
            description: "RN target",
            appId: "com.example.app",
            webSocketDebuggerUrl: `ws://example.test/inspector/debug?page=${this.attempt}`,
            sourceUrl: "http://example.test",
            reactNative: {
              logicalDeviceId: "device-1",
              capabilities: {
                nativePageReloads: true,
              },
            },
          },
        ];
      }

      createTransport(): CdpTransport {
        return new FakeTransport();
      }
    }

    const manager = new SessionManager([new FakeReactNativeProvider()]);
    await manager.selectTarget("react-native:test:page-1", { reactNativeUrl: "http://example.test" });
    const session = manager.getSession();
    if (!session) {
      throw new Error("Expected session to exist");
    }
    await session.close();

    await expect(manager.reconnectSelectedTarget()).resolves.toMatchObject({
      rawId: "page-2",
    });
    expect(manager.getSessionState()).toBe("connected");
  });
});
