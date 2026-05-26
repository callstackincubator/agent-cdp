import type { Command } from "commander";

import type { CliDeps } from "../../cli/context.js";
import { unwrapResponse } from "../../cli/shared.js";

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function registerRozeniteCliCommands(program: Command, deps: CliDeps): void {
  const rozenite = program
    .command("rozenite")
    .description("Rozenite in-app agent tools (RN; Chrome with Rozenite extension)");

  rozenite
    .command("status")
    .description("Show Rozenite plugin state and registered tool count")
    .action(async () => {
      const data = unwrapResponse(
        await deps.sendCommand({ type: "plugin-command", pluginId: "rozenite", command: "status" }),
        "Failed to get Rozenite status"
      );
      printJson(data);
    });

  rozenite
    .command("tools")
    .description("List registered Rozenite tools")
    .action(async () => {
      const data = unwrapResponse(
        await deps.sendCommand({ type: "plugin-command", pluginId: "rozenite", command: "tools" }),
        "Failed to list Rozenite tools"
      );
      printJson(data);
    });

  rozenite
    .command("tool-schema <name>")
    .description("Show input schema for a Rozenite tool")
    .action(async (name: string) => {
      const data = unwrapResponse(
        await deps.sendCommand({
          type: "plugin-command",
          pluginId: "rozenite",
          command: "tool-schema",
          input: { name },
        }),
        `Failed to get schema for tool '${name}'`
      );
      printJson(data);
    });

  rozenite
    .command("call <name>")
    .description("Call a Rozenite tool")
    .option("--input <json>", "Tool input as JSON string")
    .action(async (name: string, options: { input?: string }) => {
      const args = options.input !== undefined ? (JSON.parse(options.input) as unknown) : undefined;
      const data = unwrapResponse(
        await deps.sendCommand({
          type: "plugin-command",
          pluginId: "rozenite",
          command: "call",
          input: { name, arguments: args },
        }),
        `Failed to call tool '${name}'`
      );
      printJson(data);
    });
}