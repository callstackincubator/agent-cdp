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
      }),
    ).toContain("Providers: 2");
  });
});
