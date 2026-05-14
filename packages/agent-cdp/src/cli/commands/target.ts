import { Command } from "commander";
import { formatTargetList } from "../../formatters.js";
import type { CliDeps } from "../context.js";
import { discoveryOptions, readTargets } from "../context.js";
import { getVerbose, registerCommandGroupHelp, unwrapResponse } from "../shared.js";

export function registerTargetCommands(program: Command, deps: CliDeps): void {
  const target = registerCommandGroupHelp(program.command("target").description("Target selection commands"));

  target
    .command("list")
    .option("--url <url>")
    .description("List targets")
    .action(async (options: { url?: string }, command) => {
      await deps.ensureDaemon();
      const data = unwrapResponse(
        await deps.sendCommand({ type: "list-targets", options: discoveryOptions(options.url) }),
        "Failed to list targets",
      );
      console.log(formatTargetList(readTargets(data), getVerbose(command)));
    });

  target
    .command("select <id>")
    .option("--url <url>")
    .description("Select target")
    .action(async (targetId: string, options: { url?: string }) => {
      await deps.ensureDaemon();
      unwrapResponse(
        await deps.sendCommand({ type: "select-target", targetId, options: discoveryOptions(options.url) }),
        "Failed to select target",
      );
      console.log(`Selected target: ${targetId}`);
    });

  target
    .command("clear")
    .description("Clear selected target")
    .action(async () => {
      await deps.ensureDaemon();
      unwrapResponse(await deps.sendCommand({ type: "clear-target" }), "Failed to clear target");
      console.log("Target cleared");
    });
}
