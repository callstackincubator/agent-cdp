import { Command } from "commander";
import { formatConsoleList, formatConsoleMessage } from "../../formatters.js";
import type { ConsoleMessage } from "../../types.js";
import { DEFAULT_RUNTIME_OBJECT_GROUP, formatRuntimeEval, formatRuntimeEvalJson, formatRuntimeProperties } from "../../runtime/index.js";
import type { CliDeps } from "../context.js";
import { ensureTargetSelected } from "../context.js";
import { getVerbose, parseRequiredInteger, unwrapResponse } from "../shared.js";

function readConsoleMessages(data: unknown): ConsoleMessage[] {
  return data as ConsoleMessage[];
}

function readConsoleMessage(data: unknown): ConsoleMessage {
  return data as ConsoleMessage;
}

export function registerRuntimeAndConsoleCommands(program: Command, deps: CliDeps): void {
  const consoleCommand = program.command("console").description("Console capture commands");

  consoleCommand
    .command("list")
    .option("--limit <n>")
    .action(async (options: { limit?: string }) => {
      await ensureTargetSelected(deps);
      const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
      const data = unwrapResponse(await deps.sendCommand({ type: "list-console-messages", limit }), "Failed to list console messages");
      console.log(formatConsoleList(readConsoleMessages(data)));
    });

  consoleCommand.command("get <id>").action(async (rawId: string, _options, command) => {
    const id = parseRequiredInteger(rawId, "Usage: agent-cdp console get <id>");
    await ensureTargetSelected(deps);
    const data = unwrapResponse(await deps.sendCommand({ type: "get-console-message", id }), "Failed to get console message");
    console.log(formatConsoleMessage(readConsoleMessage(data), getVerbose(command)));
  });

  const runtime = program.command("runtime").description("Runtime inspection commands");

  runtime
    .command("eval")
    .requiredOption("--expr <expr>")
    .option("--await")
    .option("--json")
    .action(async (options: { expr: string; await?: boolean; json?: boolean }, command) => {
      await deps.ensureDaemon();
      const data = unwrapResponse(
        await deps.sendCommand({ type: "runtime-eval", expression: options.expr, awaitPromise: options.await === true }),
        "Failed to evaluate runtime expression",
      );

      console.log(
        options.json === true
          ? formatRuntimeEvalJson(data as Parameters<typeof formatRuntimeEvalJson>[0])
          : formatRuntimeEval(data as Parameters<typeof formatRuntimeEval>[0], getVerbose(command)),
      );
    });

  runtime
    .command("props")
    .requiredOption("--id <id>")
    .option("--own")
    .option("--accessor-properties-only")
    .action(
      async (options: { id: string; own?: boolean; accessorPropertiesOnly?: boolean }, command) => {
        await deps.ensureDaemon();
        const data = unwrapResponse(
          await deps.sendCommand({
            type: "runtime-get-properties",
            objectId: options.id,
            ownProperties: options.own === true,
            accessorPropertiesOnly: options.accessorPropertiesOnly === true,
          }),
          "Failed to inspect runtime object properties",
        );

        console.log(formatRuntimeProperties(data as Parameters<typeof formatRuntimeProperties>[0], getVerbose(command)));
      },
    );

  runtime
    .command("release")
    .requiredOption("--id <id>")
    .action(async (options: { id: string }) => {
      await deps.ensureDaemon();
      unwrapResponse(await deps.sendCommand({ type: "runtime-release-object", objectId: options.id }), "Failed to release runtime object");
      console.log(`Released runtime object: ${options.id}`);
    });

  runtime
    .command("release-group")
    .option("--group <name>")
    .action(async (options: { group?: string }) => {
      const objectGroup = options.group || DEFAULT_RUNTIME_OBJECT_GROUP;
      await deps.ensureDaemon();
      unwrapResponse(
        await deps.sendCommand({ type: "runtime-release-object-group", objectGroup }),
        "Failed to release runtime object group",
      );
      console.log(`Released runtime object group: ${objectGroup}`);
    });
}
