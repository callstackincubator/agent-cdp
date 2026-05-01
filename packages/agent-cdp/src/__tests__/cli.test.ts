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
  });

  it("prints the available daemon commands", () => {
    expect(usage()).toContain("start");
    expect(usage()).toContain("status");
    expect(usage()).toContain("stop");
    expect(usage()).toContain("target list");
  });
});
