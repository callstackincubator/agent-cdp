import { SessionManager } from "../session-manager.js";
import type { CdpEventMessage, CdpTransport, TargetProvider } from "../types.js";

const CHROME_TEST_ID = "chrome:ZXhhbXBsZS50ZXN0:page-1";
const REACT_NATIVE_TEST_ID = "react-native:ZXhhbXBsZS50ZXN0:page-1";

class FakeTransport implements CdpTransport {
  connected = false;
  calibrationResult: unknown = {
    result: {
      value: {
        monotonic: 123.45,
        timeOrigin: 1_700_000_000_000,
        wall: 1_700_000_000_123.45,
      },
    },
  };
  readonly sentMethods: string[] = [];

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

  send(method: string): Promise<unknown> {
    this.sentMethods.push(method);
    if (method === "Runtime.evaluate") {
      return Promise.resolve(this.calibrationResult);
    }
    return Promise.resolve(undefined);
  }

  onEvent(_listener: (message: CdpEventMessage) => void): () => void {
    return () => undefined;
  }
}

class FakeProvider implements TargetProvider {
  readonly kind = "chrome" as const;
  readonly transports: FakeTransport[] = [];

  createTransport(): CdpTransport {
    const transport = new FakeTransport();
    this.transports.push(transport);
    return transport;
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
    expect(manager.getSession()?.metadata.clockCalibration).toMatchObject({
      state: "calibrated",
      targetMonotonicTimeMs: 123.45,
      targetTimeOriginMs: 1_700_000_000_000,
      targetWallTimeMs: 1_700_000_000_123.45,
    });
    await manager.clearTarget();
    expect(manager.getSelectedTarget()).toBeNull();
    expect(manager.getSessionState()).toBe("disconnected");
  });

  it("records explicit unavailable calibration when the target runtime cannot provide one", async () => {
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
    const provider = new FakeProvider();
    const manager = new SessionManager([provider], () => Promise.resolve(targets));
    provider.createTransport = () => {
      const transport = new FakeTransport();
      transport.calibrationResult = {
        result: {
          value: {
            monotonic: null,
          },
        },
      };
      provider.transports.push(transport);
      return transport;
    };

    await manager.selectTarget(CHROME_TEST_ID, {});

    expect(manager.getSession()?.metadata.clockCalibration).toMatchObject({
      state: "unavailable",
      reason: "Target runtime did not provide performance.now()",
    });
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

  it("reconnects react native targets by logical device id", async () => {
    class FakeReactNativeProvider implements TargetProvider {
      readonly kind = "react-native" as const;
      private transportAttempt = 0;

      createTransport(): CdpTransport {
        this.transportAttempt += 1;
        const transport = new FakeTransport();
        transport.calibrationResult = {
          result: {
            value: {
              monotonic: this.transportAttempt * 100,
              timeOrigin: 1_700_000_000_000,
            },
          },
        };
        return transport;
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
    expect(manager.getSession()?.metadata.clockCalibration).toMatchObject({
      state: "calibrated",
      targetMonotonicTimeMs: 200,
      targetWallTimeMs: 1_700_000_000_200,
    });
  });
});
