import { SessionManager } from "../session-manager.js";
import type { CdpEventMessage, CdpTransport, TargetDescriptor, TargetProvider } from "../types.js";

const CHROME_TEST_ID = "chrome:ZXhhbXBsZS50ZXN0:page-1";
const REACT_NATIVE_TEST_ID = "react-native:ZXhhbXBsZS50ZXN0:page-1";
const LEGACY_CHROME_TEST_ID = "chrome:page-1";

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

  createTransport(): CdpTransport {
    return new FakeTransport();
  }
}

describe("SessionManager", () => {
  it("lists targets from configured providers", async () => {
    const targets = [
      {
        id: CHROME_TEST_ID,
        rawId: "page-1",
        title: "Example",
        kind: "chrome" as const,
        description: "Test page",
        webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
        sourceUrl: "http://example.test",
      },
    ];
    const manager = new SessionManager([new FakeProvider()], () => Promise.resolve(targets));
    await expect(manager.listTargets({ url: "http://example.test" })).resolves.toHaveLength(1);
  });

  it("selects and clears a target", async () => {
    const targets = [
      {
        id: CHROME_TEST_ID,
        rawId: "page-1",
        title: "Example",
        kind: "chrome" as const,
        description: "Test page",
        webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
        sourceUrl: "http://example.test",
      },
    ];
    const manager = new SessionManager([new FakeProvider()], () => Promise.resolve(targets));
    await expect(manager.selectTarget(CHROME_TEST_ID, {})).resolves.toMatchObject({
      title: "Example",
    });
    expect(manager.getSessionState()).toBe("connected");
    await manager.clearTarget();
    expect(manager.getSelectedTarget()).toBeNull();
    expect(manager.getSessionState()).toBe("disconnected");
  });

  it("rejects mismatched explicit urls when selecting a target", async () => {
    const targets = [
      {
        id: CHROME_TEST_ID,
        rawId: "page-1",
        title: "Example",
        kind: "chrome" as const,
        description: "Test page",
        webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
        sourceUrl: "http://example.test",
      },
    ];
    const manager = new SessionManager([new FakeProvider()], () => Promise.resolve(targets));

    await expect(manager.selectTarget(CHROME_TEST_ID, { url: "http://other.test" })).rejects.toThrow(
      `Target id source does not match --url: ${CHROME_TEST_ID}`,
    );
  });

  it("selects targets with legacy ids when an explicit url is provided", async () => {
    const targets = [
      {
        id: CHROME_TEST_ID,
        rawId: "page-1",
        title: "Example",
        kind: "chrome" as const,
        description: "Test page",
        webSocketDebuggerUrl: "ws://example.test/devtools/page/1",
        sourceUrl: "http://example.test",
      },
    ];
    const manager = new SessionManager([new FakeProvider()], () => Promise.resolve(targets));

    await expect(manager.selectTarget(LEGACY_CHROME_TEST_ID, { url: "example.test" })).resolves.toMatchObject({
      id: CHROME_TEST_ID,
      title: "Example",
    });
  });

  it("reconnects react native targets by logical device id", async () => {
    class FakeReactNativeProvider implements TargetProvider {
      readonly kind = "react-native" as const;
      private attempt = 0;

      async listTargets(): Promise<TargetDescriptor[]> {
        this.attempt += 1;
        return [
          {
            id: `react-native:ZXhhbXBsZS50ZXN0:page-${this.attempt}`,
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

    const discoverTargetsImpl = (() => {
      let attempt = 0;

      return () => {
        attempt += 1;
        return Promise.resolve([
          {
            id: `react-native:ZXhhbXBsZS50ZXN0:page-${attempt}`,
            rawId: `page-${attempt}`,
            title: "React Native Experimental",
            kind: "react-native" as const,
            description: "RN target",
            appId: "com.example.app",
            webSocketDebuggerUrl: `ws://example.test/inspector/debug?page=${attempt}`,
            sourceUrl: "http://example.test",
            reactNative: {
              logicalDeviceId: "device-1",
              capabilities: {
                nativePageReloads: true,
              },
            },
          },
        ]);
      };
    })();

    const manager = new SessionManager([new FakeReactNativeProvider()], discoverTargetsImpl);
    await manager.selectTarget(REACT_NATIVE_TEST_ID, {});
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
