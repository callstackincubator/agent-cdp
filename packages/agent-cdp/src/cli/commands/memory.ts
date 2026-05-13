import { Command } from "commander";
import { formatMemLeakCandidates, formatMemLeakTriplet, formatMemSnapshotClass, formatMemSnapshotClasses, formatMemSnapshotDiff, formatMemSnapshotInstance, formatMemSnapshotInstances, formatMemSnapshotList, formatMemSnapshotMeta, formatMemSnapshotRetainers, formatMemSnapshotSummary } from "../../heap-snapshot/formatters.js";
import type { MemSnapshotMeta } from "../../heap-snapshot/types.js";
import { formatJsMemoryDiff, formatJsMemoryLeakSignal, formatJsMemoryList, formatJsMemorySample, formatJsMemorySummary, formatJsMemoryTrend } from "../../js-memory/formatters.js";
import type { CliDeps } from "../context.js";
import { ensureTargetSelected } from "../context.js";
import { getVerbose, parseInteger, parseRequiredInteger, registerCommandGroupHelp, unwrapResponse } from "../shared.js";

export function registerMemoryCommands(program: Command, deps: CliDeps): void {
  const memory = registerCommandGroupHelp(program.command("memory").description("Memory inspection commands"));
  const snapshot = registerCommandGroupHelp(memory.command("snapshot").description("Heap snapshot analysis commands"));

  snapshot.command("capture").option("--name <name>").option("--gc").option("--file <path>").action(async (options: { name?: string; gc?: boolean; file?: string }, command) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-capture", name: options.name, collectGarbage: options.gc === true, filePath: options.file }),
      "Failed to capture heap snapshot",
    );
    console.log(formatMemSnapshotMeta(data as MemSnapshotMeta, getVerbose(command)));
  });

  snapshot.command("load").requiredOption("--file <path>").option("--name <name>").action(async (options: { file: string; name?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "mem-snapshot-load", filePath: options.file, name: options.name }), "Failed to load heap snapshot");
    console.log(formatMemSnapshotMeta(data as MemSnapshotMeta, getVerbose(command)));
  });

  snapshot.command("list").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "mem-snapshot-list" }), "Failed to list heap snapshots");
    console.log(formatMemSnapshotList(data as Parameters<typeof formatMemSnapshotList>[0], getVerbose(command)));
  });

  snapshot.command("summary").option("--snapshot <id>").action(async (options: { snapshot?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "mem-snapshot-summary", snapshotId: options.snapshot }), "Failed to get snapshot summary");
    console.log(formatMemSnapshotSummary(data as Parameters<typeof formatMemSnapshotSummary>[0], getVerbose(command)));
  });

  snapshot.command("classes").option("--snapshot <id>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").option("--filter <text>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-classes", snapshotId: options.snapshot, limit: parseInteger(options.limit), offset: parseInteger(options.offset), sortBy: options.sort, filter: options.filter }),
      "Failed to get snapshot classes",
    );
    console.log(formatMemSnapshotClasses(data as Parameters<typeof formatMemSnapshotClasses>[0], getVerbose(command)));
  });

  snapshot.command("class").requiredOption("--id <id>").option("--snapshot <id>").action(async (options: { id: string; snapshot?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "mem-snapshot-class", classId: options.id, snapshotId: options.snapshot }), "Failed to get class details");
    console.log(formatMemSnapshotClass(data as Parameters<typeof formatMemSnapshotClass>[0], getVerbose(command)));
  });

  snapshot.command("instances").requiredOption("--class <id>").option("--snapshot <id>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const classId = options.class;
    if (!classId) throw new Error("Usage: agent-cdp mem-snapshot instances --class CLASS_ID");
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-instances", classId, snapshotId: options.snapshot, limit: parseInteger(options.limit), offset: parseInteger(options.offset), sortBy: options.sort }),
      "Failed to get instances",
    );
    console.log(formatMemSnapshotInstances(data as Parameters<typeof formatMemSnapshotInstances>[0], getVerbose(command)));
  });

  snapshot.command("instance").requiredOption("--id <id>").option("--snapshot <id>").action(async (options: { id: string; snapshot?: string }, command) => {
    await deps.ensureDaemon();
    const nodeId = parseRequiredInteger(options.id, "Usage: agent-cdp memory snapshot instance --id NODE_ID");
    const data = unwrapResponse(await deps.sendCommand({ type: "mem-snapshot-instance", nodeId, snapshotId: options.snapshot }), "Failed to get instance");
    console.log(formatMemSnapshotInstance(data as Parameters<typeof formatMemSnapshotInstance>[0], getVerbose(command)));
  });

  snapshot.command("retainers").requiredOption("--id <id>").option("--snapshot <id>").option("--depth <n>").option("--limit <n>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const nodeId = parseRequiredInteger(options.id, "Usage: agent-cdp memory snapshot retainers --id NODE_ID");
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-retainers", nodeId, snapshotId: options.snapshot, depth: parseInteger(options.depth), limit: parseInteger(options.limit) }),
      "Failed to get retainers",
    );
    console.log(formatMemSnapshotRetainers(data as Parameters<typeof formatMemSnapshotRetainers>[0], getVerbose(command)));
  });

  snapshot.command("diff").requiredOption("--base <id>").requiredOption("--compare <id>").option("--sort <sort>").option("--limit <n>").action(async (options: Record<string, string>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-diff", baseSnapshotId: options.base, compareSnapshotId: options.compare, sortBy: options.sort, limit: parseInteger(options.limit) }),
      "Failed to diff snapshots",
    );
    console.log(formatMemSnapshotDiff(data as Parameters<typeof formatMemSnapshotDiff>[0], getVerbose(command)));
  });

  snapshot.command("leak-triplet").requiredOption("--baseline <id>").requiredOption("--action <id>").requiredOption("--cleanup <id>").option("--limit <n>").action(async (options: Record<string, string>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-leak-triplet", baselineSnapshotId: options.baseline, actionSnapshotId: options.action, cleanupSnapshotId: options.cleanup, limit: parseInteger(options.limit) }),
      "Failed to analyze leak triplet",
    );
    console.log(formatMemLeakTriplet(data as Parameters<typeof formatMemLeakTriplet>[0], getVerbose(command)));
  });

  snapshot.command("leak-candidates").option("--snapshot <id>").option("--limit <n>").action(async (options: { snapshot?: string; limit?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "mem-snapshot-leak-candidates", snapshotId: options.snapshot, limit: parseInteger(options.limit) }),
      "Failed to get leak candidates",
    );
    console.log(formatMemLeakCandidates(data as Parameters<typeof formatMemLeakCandidates>[0], getVerbose(command)));
  });

  const usage = registerCommandGroupHelp(memory.command("usage").description("JS heap usage monitor commands"));

  usage.command("sample").option("--label <label>").option("--gc").action(async (options: { label?: string; gc?: boolean }, command) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-memory-sample", label: options.label, collectGarbage: options.gc === true }),
      "Failed to capture heap usage sample",
    );
    console.log(formatJsMemorySample(data as Parameters<typeof formatJsMemorySample>[0], getVerbose(command)));
  });

  usage.command("list").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-memory-list", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }),
      "Failed to list JS memory samples",
    );
    console.log(formatJsMemoryList(data as Parameters<typeof formatJsMemoryList>[0], getVerbose(command)));
  });

  usage.command("summary").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-memory-summary" }), "Failed to get JS memory summary");
    console.log(formatJsMemorySummary(data as Parameters<typeof formatJsMemorySummary>[0], getVerbose(command)));
  });

  usage.command("diff").requiredOption("--base <id>").requiredOption("--compare <id>").action(async (options: { base: string; compare: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-memory-diff", baseSampleId: options.base, compareSampleId: options.compare }),
      "Failed to diff JS memory samples",
    );
    console.log(formatJsMemoryDiff(data as Parameters<typeof formatJsMemoryDiff>[0], getVerbose(command)));
  });

  usage.command("trend").option("--limit <n>").action(async (options: { limit?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-memory-trend", limit: parseInteger(options.limit) }), "Failed to get JS memory trend");
    console.log(formatJsMemoryTrend(data as Parameters<typeof formatJsMemoryTrend>[0], getVerbose(command)));
  });

  usage.command("leak-signal").option("--since <sampleId>").action(async (options: { since?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-memory-leak-signal", sinceSampleId: options.since }),
      "Failed to get JS memory leak signal",
    );
    console.log(formatJsMemoryLeakSignal(data as Parameters<typeof formatJsMemoryLeakSignal>[0], getVerbose(command)));
  });
}
