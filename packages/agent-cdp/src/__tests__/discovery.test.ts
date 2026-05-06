import {
  buildTargetId,
  decodeTargetSource,
  DEFAULT_DISCOVERY_URLS,
  dedupeReactNativeTargets,
  discoverTargets,
  encodeTargetSource,
  getDiscoveryUrl,
  getDiscoveryUrls,
  mapChromeTarget,
  mapReactNativeTarget,
  parseTargetId,
} from "../discovery.js";

describe("discovery helpers", () => {
  it("builds deterministic target ids", () => {
    expect(buildTargetId("chrome", "http://127.0.0.1:9222", "page-1")).toBe(
      "chrome:MTI3LjAuMC4xOjkyMjI:page-1",
    );
  });

  it("strips only http scheme when encoding the source", () => {
    expect(encodeTargetSource("http://127.0.0.1:9222")).toBe("MTI3LjAuMC4xOjkyMjI");
    expect(decodeTargetSource("MTI3LjAuMC4xOjkyMjI")).toBe("http://127.0.0.1:9222");
  });

  it("preserves non-http schemes when encoding the source", () => {
    const encoded = encodeTargetSource("https://example.test:8443/devtools?foo=1");
    expect(decodeTargetSource(encoded)).toBe("https://example.test:8443/devtools?foo=1");
  });

  it("parses target ids back to their source url", () => {
    expect(parseTargetId("chrome:MTI3LjAuMC4xOjkyMjI:page-1")).toEqual({
      kind: "chrome",
      encodedSource: "MTI3LjAuMC4xOjkyMjI",
      rawId: "page-1",
      sourceUrl: "http://127.0.0.1:9222",
    });
  });

  it("maps the configured discovery url", () => {
    expect(getDiscoveryUrl({ url: "127.0.0.1:9222/" })).toBe("http://127.0.0.1:9222");
  });

  it("returns default discovery urls when none are configured", () => {
    expect(getDiscoveryUrls({})).toEqual([...DEFAULT_DISCOVERY_URLS]);
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
      id: "chrome:MTI3LjAuMC4xOjkyMjI:page-1",
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
      id: "react-native:MTI3LjAuMC4xOjgwODE:device-page",
      kind: "react-native",
      appId: "com.example.app",
      reactNative: {
        logicalDeviceId: "device-1",
      },
    });
  });

  it("keeps only the newest react native target when ids differ only by numeric suffix", () => {
    expect(
      dedupeReactNativeTargets([
        {
          id: "react-native:MTI3LjAuMC4xOjgwODE:device-1-1",
          rawId: "device-1-1",
          title: "Expo",
          kind: "react-native",
          description: "React Native Bridgeless [C++ connection]",
          appId: "host.exp.Exponent",
          webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=device-1&page=1",
          sourceUrl: "http://127.0.0.1:8081",
          reactNative: {
            logicalDeviceId: "device-1",
            capabilities: {
              nativePageReloads: true,
            },
          },
        },
        {
          id: "react-native:MTI3LjAuMC4xOjgwODE:device-1-2",
          rawId: "device-1-2",
          title: "Expo",
          kind: "react-native",
          description: "React Native Bridgeless [C++ connection]",
          appId: "host.exp.Exponent",
          webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=device-1&page=2",
          sourceUrl: "http://127.0.0.1:8081",
          reactNative: {
            logicalDeviceId: "device-1",
            capabilities: {
              nativePageReloads: true,
            },
          },
        },
      ]),
    ).toMatchObject([
      {
        rawId: "device-1-2",
        webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=device-1&page=2",
      },
    ]);
  });

  it("keeps ids unique across different source urls", () => {
    expect(buildTargetId("chrome", "http://127.0.0.1:9222", "page-1")).not.toBe(
      buildTargetId("chrome", "http://127.0.0.1:9229", "page-1"),
    );
  });

  it("merges successful targets across default discovery urls", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "page-1", title: "Chrome", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1" }]),
        ),
      )
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "device-page",
              title: "React Native Experimental",
              appId: "com.example.app",
              webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?page=1",
              reactNative: { logicalDeviceId: "device-1", capabilities: {} },
            },
          ]),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverTargets({})).resolves.toMatchObject([
      { id: "chrome:MTI3LjAuMC4xOjkyMjI:page-1", kind: "chrome" },
      { id: "react-native:MTI3LjAuMC4xOjgwODE:device-page", kind: "react-native" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws for explicit discovery url failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(discoverTargets({ url: "127.0.0.1:9222" })).rejects.toThrow(
      "Target discovery failed for http://127.0.0.1:9222: HTTP 500",
    );
  });
});
