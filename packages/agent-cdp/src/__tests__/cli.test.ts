import { parseArgs, usage } from "../cli.js";

describe("cli", () => {
  it("parses command arguments", () => {
    expect(parseArgs(["start"])).toEqual(["start"]);
    expect(parseArgs(["status", "--json"])).toEqual(["status"]);
  });

  it("prints the available daemon commands", () => {
    expect(usage()).toContain("start");
    expect(usage()).toContain("status");
    expect(usage()).toContain("stop");
  });
});
