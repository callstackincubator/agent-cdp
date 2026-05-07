import { CommanderError } from "commander";
import type { CliDeps } from "./context.js";
import { defaultCliDeps, ensureTargetSelected, MULTIPLE_TARGETS_AVAILABLE_MESSAGE } from "./context.js";
import { usage } from "./help.js";
import { createProgram } from "./program.js";

export { ensureTargetSelected, MULTIPLE_TARGETS_AVAILABLE_MESSAGE, usage };

function shouldPrintHelp(argv: string[]): boolean {
  return argv.length === 0 || argv[0] === "help" || (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"));
}

export async function main(argv = process.argv.slice(2), deps: CliDeps = defaultCliDeps): Promise<void> {
  if (shouldPrintHelp(argv)) {
    console.log(usage());
    return;
  }

  const program = createProgram(deps);

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return;
    }

    throw error;
  }
}
