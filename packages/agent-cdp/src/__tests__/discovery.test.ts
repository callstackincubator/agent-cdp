import { buildTargetId, getDiscoveryUrls, mapChromeTarget, mapReactNativeTarget } from "../discovery.js";

describe("discovery helpers", () => {
  it("builds deterministic target ids", () => {
    expect(buildTargetId("chrome", "http://127.0.0.1:9222/", "page-1")).toBe(
      "chrome:http%3A%2F%2F127.0.0.1%3A9222:page-1",
    );
  });

  it("maps configured discovery urls", () => {
    expect(getDiscoveryUrls({ chromeUrl: "http://127.0.0.1:9222/", reactNativeUrl: "http://127.0.0.1:8081/" })).toEqual([
      { kind: "chrome", url: "http://127.0.0.1:9222" },
      { kind: "react-native", url: "http://127.0.0.1:8081" },
    ]);
  });

  it("maps chrome targets", () => {
    expect(
      mapChromeTarget("http://127.0.0.1:9222", {
        id: "page-1",
        title: "Example",
        type: "page",
        webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1",
      }),
    ).toMatchObject({
      rawId: "page-1",
      kind: "chrome",
      title: "Example",
    });
  });

  it("maps react native targets", () => {
    expect(
      mapReactNativeTarget("http://127.0.0.1:8081", {
        id: "device-page",
        title: "React Native Experimental",
        appId: "com.example.app",
        webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=1&page=2",
        reactNative: {
          logicalDeviceId: "device-1",
          capabilities: {
            nativePageReloads: true,
          },
        },
      }),
    ).toMatchObject({
      kind: "react-native",
      appId: "com.example.app",
      reactNative: {
        logicalDeviceId: "device-1",
      },
    });
  });
});
