import { parseArgs, usage } from "../cli.js";

describe("cli", () => {
  it("parses command arguments", () => {
    expect(parseArgs(["start"])).toEqual({ command: ["start"], flags: {} });
    expect(parseArgs(["target", "list", "--url", "http://127.0.0.1:9222"])).toEqual({
      command: ["target", "list"],
      flags: {
        url: "http://127.0.0.1:9222",
      },
    });
    expect(parseArgs(["target", "select", "chrome:MTI3LjAuMC4xOjkyMjI:page-1"])).toEqual({
      command: ["target", "select", "chrome:MTI3LjAuMC4xOjkyMjI:page-1"],
      flags: {},
    });
  });

  it("prints the available daemon commands", () => {
    expect(usage()).toContain("start");
    expect(usage()).toContain("status");
    expect(usage()).toContain("stop");
    expect(usage()).toContain("target list [--url URL]");
    expect(usage()).toContain("target select <id> [--url URL]");
    expect(usage()).toContain("js-allocation start");
    expect(usage()).toContain("js-allocation-timeline start");
  });
});
