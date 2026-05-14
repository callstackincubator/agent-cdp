import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { getPackageVersion } from "../../version.js";
import type { CliDeps } from "../context.js";
import { readStatusInfo } from "../context.js";
import { getVerbose, unwrapResponse } from "../shared.js";
import { formatStatus } from "../../formatters.js";

export function registerBaseCommands(program: Command, deps: CliDeps): void {
  program
    .command("start")
    .description("Start daemon")
    .action(async (_options, command) => {
      await deps.ensureDaemon();
      const data = unwrapResponse(await deps.sendCommand({ type: "status" }), "Failed to load daemon status");
      console.log(formatStatus(readStatusInfo(data), getVerbose(command)));
    });

  program
    .command("stop")
    .description("Stop daemon")
    .action(async () => {
      console.log((await deps.stopDaemon()) ? "Daemon stopped" : "Daemon is not running");
    });

  program
    .command("status")
    .description("Show daemon status")
    .action(async (_options, command) => {
      await deps.ensureDaemon();
      const data = unwrapResponse(await deps.sendCommand({ type: "status" }), "Failed to load daemon status");
      console.log(formatStatus(readStatusInfo(data), getVerbose(command)));
    });

  const skills = program.command("skills").description("Read bundled skills");

  const printSkillList = () => {
    const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "skills");
    const files = readdirSync(skillsDir).filter((file) => file.endsWith(".md"));
    const names = files.map((file) => file.replace(/\.md$/, ""));
    console.log(names.join("\n"));
  };

  skills.action(printSkillList);
  skills.command("list").description("List available skills").action(printSkillList);
  skills
    .command("get <name>")
    .description("Print a skill file")
    .action((name: string) => {
      const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "skills");
      const filePath = join(skillsDir, `${name}.md`);
      console.log(readFileSync(filePath, "utf8"));
    });

  program.version(getPackageVersion(), "-V, --version", "Output the current version");
}
