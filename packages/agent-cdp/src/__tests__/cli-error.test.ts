import { CommanderError } from "commander";
import { getCliFailure } from "../cli/error.js";

describe("cli error handling", () => {
  it("does not duplicate commander output", () => {
    expect(getCliFailure(new CommanderError(1, "commander.missingMandatoryOptionValue", "error: required option '--file <path>' not specified"))).toEqual({
      message: null,
      exitCode: 1,
    });
  });

  it("preserves non-commander error messages", () => {
    expect(getCliFailure(new Error("boom"))).toEqual({
      message: "boom",
      exitCode: 1,
    });
  });
});
