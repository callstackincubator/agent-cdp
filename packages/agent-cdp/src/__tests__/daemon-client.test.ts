import { getRequiredDaemonAction } from "../daemon-client.js";

describe("getRequiredDaemonAction", () => {
  const currentVersion = "1.2.0";

  it("reuses a live daemon with the same version", () => {
    expect(
      getRequiredDaemonAction(
        {
          pid: 123,
          socketPath: "/tmp/daemon.sock",
          startedAt: Date.now(),
          version: currentVersion,
        },
        currentVersion,
        true,
      ),
    ).toBe("reuse");
  });

  it("restarts a live daemon with a different version", () => {
    expect(
      getRequiredDaemonAction(
        {
          pid: 123,
          socketPath: "/tmp/daemon.sock",
          startedAt: Date.now(),
          version: "1.1.0",
        },
        currentVersion,
        true,
      ),
    ).toBe("restart");
  });

  it("restarts a live daemon when version metadata is missing", () => {
    expect(
      getRequiredDaemonAction(
        {
          pid: 123,
          socketPath: "/tmp/daemon.sock",
          startedAt: Date.now(),
        },
        currentVersion,
        true,
      ),
    ).toBe("restart");
  });

  it("starts fresh when the recorded daemon is not alive", () => {
    expect(
      getRequiredDaemonAction(
        {
          pid: 123,
          socketPath: "/tmp/daemon.sock",
          startedAt: Date.now(),
          version: currentVersion,
        },
        currentVersion,
        false,
      ),
    ).toBe("start");
  });

  it("starts fresh when no daemon info exists", () => {
    expect(getRequiredDaemonAction(null, currentVersion, false)).toBe("start");
  });
});
