import { formatStatus } from "../formatters.js";

describe("formatStatus", () => {
  it("renders a compact daemon summary", () => {
    expect(
      formatStatus({
        daemonRunning: true,
        uptime: 2300,
        providerCount: 2,
        sessionState: "disconnected",
        selectedTarget: null,
        tracingActive: false,
      }),
    ).toContain("session:disconnected");
  });

  it("renders session calibration details in verbose mode", () => {
    expect(
      formatStatus(
        {
          daemonRunning: true,
          uptime: 2300,
          providerCount: 2,
          sessionState: "connected",
          selectedTarget: null,
          tracingActive: false,
          sessionDetails: {
            connectedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
            clockCalibration: {
              state: "unavailable",
              hostRequestTimeMs: 1,
              hostResponseTimeMs: 3,
              hostMidpointTimeMs: 2,
              roundTripTimeMs: 2,
              reason: "Runtime evaluation failed",
            },
          },
        },
        true,
      ),
    ).toContain("Session clock: unavailable (Runtime evaluation failed)");
  });
});
