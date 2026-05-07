import { Command } from "commander";
import type { CliDeps } from "./context.js";
import { defaultCliDeps } from "./context.js";
import { registerBaseCommands } from "./commands/base.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerNetworkAndTraceCommands } from "./commands/network-trace.js";
import { registerProfilingCommands } from "./commands/profiling.js";
import { registerRuntimeAndConsoleCommands } from "./commands/runtime-console.js";
import { registerTargetCommands } from "./commands/target.js";

export function createProgram(deps: CliDeps = defaultCliDeps): Command {
  const program = new Command();
  program.name("agent-cdp");
  program.description("CLI for Chrome DevTools Protocol workflows");
  program.option("--verbose", "Richer output (symbolicated paths, source-map stats, extra detail)");
  program.helpOption(false);
  program.allowExcessArguments(false);
  program.showSuggestionAfterError(true);
  program.showHelpAfterError(false);
  program.exitOverride();

  registerBaseCommands(program, deps);
  registerTargetCommands(program, deps);
  registerRuntimeAndConsoleCommands(program, deps);
  registerNetworkAndTraceCommands(program, deps);
  registerMemoryCommands(program, deps);
  registerProfilingCommands(program, deps);

  return program;
}
