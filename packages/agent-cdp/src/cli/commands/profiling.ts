import { Command } from "commander";
import { formatJsAllocationBucketed, formatJsAllocationExport, formatJsAllocationHotspots, formatJsAllocationLeakSignal, formatJsAllocationList, formatJsAllocationStatus, formatJsAllocationSummary } from "../../js-allocation/formatters.js";
import { formatJsAllocationTimelineBuckets, formatJsAllocationTimelineExport, formatJsAllocationTimelineHotspots, formatJsAllocationTimelineLeakSignal, formatJsAllocationTimelineList, formatJsAllocationTimelineStatus, formatJsAllocationTimelineSummary } from "../../js-allocation-timeline/formatters.js";
import { formatJsDiff, formatJsHotspotDetail, formatJsHotspots, formatJsModules, formatJsProfileStatus, formatJsProfileSummary, formatJsSessionList, formatJsSlice, formatJsSourceMaps, formatJsStacks } from "../../js-profiler/formatters.js";
import type { CliDeps } from "../context.js";
import { ensureTargetSelected } from "../context.js";
import { getVerbose, parseFloatNumber, parseInteger, parseRequiredFloat, unwrapResponse } from "../shared.js";

export function registerProfilingCommands(program: Command, deps: CliDeps): void {
  const allocation = program.command("js-allocation").description("JS allocation profiler commands");

  allocation.command("start").option("--name <name>").option("--interval <bytes>").option("--stack-depth <n>").option("--include-major-gc").option("--include-minor-gc").action(async (options: Record<string, string | boolean | undefined>) => {
    await ensureTargetSelected(deps);
    unwrapResponse(
      await deps.sendCommand({
        type: "js-allocation-start",
        name: typeof options.name === "string" ? options.name : undefined,
        samplingIntervalBytes: parseInteger(typeof options.interval === "string" ? options.interval : undefined),
        stackDepth: parseInteger(typeof options.stackDepth === "string" ? options.stackDepth : undefined),
        includeObjectsCollectedByMajorGC: options.includeMajorGc === true,
        includeObjectsCollectedByMinorGC: options.includeMinorGc === true,
      }),
      "Failed to start JS allocation session",
    );
    console.log("JS allocation session started");
  });

  allocation.command("stop").action(async () => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-stop" }), "Failed to stop JS allocation session");
    console.log(`JS allocation session stopped. Session ID: ${data as string}`);
  });

  allocation.command("status").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-status" }), "Failed to get JS allocation status");
    console.log(formatJsAllocationStatus(data as Parameters<typeof formatJsAllocationStatus>[0], getVerbose(command)));
  });

  allocation.command("list").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-allocation-list-sessions", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }),
      "Failed to list JS allocation sessions",
    );
    console.log(formatJsAllocationList(data as Parameters<typeof formatJsAllocationList>[0], getVerbose(command)));
  });

  allocation.command("summary").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-summary", sessionId: options.session }), "Failed to get JS allocation summary");
    console.log(formatJsAllocationSummary(data as Parameters<typeof formatJsAllocationSummary>[0], getVerbose(command)));
  });

  allocation.command("hotspots").option("--session <id>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-allocation-hotspots", sessionId: options.session, limit: parseInteger(options.limit), offset: parseInteger(options.offset), sortBy: options.sort }),
      "Failed to get JS allocation hotspots",
    );
    console.log(formatJsAllocationHotspots(data as Parameters<typeof formatJsAllocationHotspots>[0], getVerbose(command)));
  });

  allocation.command("bucketed").option("--session <id>").option("--limit <n>").action(async (options: { session?: string; limit?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-bucketed", sessionId: options.session, limit: parseInteger(options.limit) }), "Failed to get JS allocation buckets");
    console.log(formatJsAllocationBucketed(data as Parameters<typeof formatJsAllocationBucketed>[0], getVerbose(command)));
  });

  allocation.command("leak-signal").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-leak-signal", sessionId: options.session }), "Failed to get JS allocation leak signal");
    console.log(formatJsAllocationLeakSignal(data as Parameters<typeof formatJsAllocationLeakSignal>[0], getVerbose(command)));
  });

  allocation.command("export").requiredOption("--file <path>").option("--session <id>").action(async (options: { file: string; session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-export", sessionId: options.session, filePath: options.file }), "Failed to export JS allocation artifact");
    console.log(formatJsAllocationExport(data as Parameters<typeof formatJsAllocationExport>[0], getVerbose(command)));
  });

  allocation.command("source-maps").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-source-maps", sessionId: options.session }), "Failed to get JS allocation source map info");
    console.log(formatJsSourceMaps(data as Parameters<typeof formatJsSourceMaps>[0], getVerbose(command)));
  });

  const timeline = program.command("js-allocation-timeline").description("JS allocation timeline commands");

  timeline.command("start").option("--name <name>").action(async (options: { name?: string }) => {
    await ensureTargetSelected(deps);
    unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-start", name: options.name }), "Failed to start JS allocation timeline session");
    console.log("JS allocation timeline session started");
  });

  timeline.command("stop").action(async () => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-stop" }), "Failed to stop JS allocation timeline session");
    console.log(`JS allocation timeline session stopped. Session ID: ${data as string}`);
  });

  timeline.command("status").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-status" }), "Failed to get JS allocation timeline status");
    console.log(formatJsAllocationTimelineStatus(data as Parameters<typeof formatJsAllocationTimelineStatus>[0], getVerbose(command)));
  });

  timeline.command("list").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "js-allocation-timeline-list-sessions", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }),
      "Failed to list JS allocation timeline sessions",
    );
    console.log(formatJsAllocationTimelineList(data as Parameters<typeof formatJsAllocationTimelineList>[0], getVerbose(command)));
  });

  timeline.command("summary").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-summary", sessionId: options.session }), "Failed to get JS allocation timeline summary");
    console.log(formatJsAllocationTimelineSummary(data as Parameters<typeof formatJsAllocationTimelineSummary>[0], getVerbose(command)));
  });

  timeline.command("buckets").option("--session <id>").option("--limit <n>").action(async (options: { session?: string; limit?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-buckets", sessionId: options.session, limit: parseInteger(options.limit) }), "Failed to get JS allocation timeline buckets");
    console.log(formatJsAllocationTimelineBuckets(data as Parameters<typeof formatJsAllocationTimelineBuckets>[0], getVerbose(command)));
  });

  timeline.command("hotspots").option("--session <id>").option("--limit <n>").option("--offset <n>").action(async (options: { session?: string; limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-hotspots", sessionId: options.session, limit: parseInteger(options.limit), offset: parseInteger(options.offset) }), "Failed to get JS allocation timeline hotspots");
    console.log(formatJsAllocationTimelineHotspots(data as Parameters<typeof formatJsAllocationTimelineHotspots>[0], getVerbose(command)));
  });

  timeline.command("leak-signal").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-leak-signal", sessionId: options.session }), "Failed to get JS allocation timeline leak signal");
    console.log(formatJsAllocationTimelineLeakSignal(data as Parameters<typeof formatJsAllocationTimelineLeakSignal>[0], getVerbose(command)));
  });

  timeline.command("export").requiredOption("--file <path>").option("--session <id>").action(async (options: { file: string; session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-export", sessionId: options.session, filePath: options.file }), "Failed to export JS allocation timeline artifact");
    console.log(formatJsAllocationTimelineExport(data as Parameters<typeof formatJsAllocationTimelineExport>[0], getVerbose(command)));
  });

  timeline.command("source-maps").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-allocation-timeline-source-maps", sessionId: options.session }), "Failed to get JS allocation timeline source map info");
    console.log(formatJsSourceMaps(data as Parameters<typeof formatJsSourceMaps>[0], getVerbose(command)));
  });

  const profile = program.command("js-profile").description("JS profile commands");

  profile.command("start").option("--name <name>").option("--interval <us>").action(async (options: { name?: string; interval?: string }) => {
    await ensureTargetSelected(deps);
    unwrapResponse(await deps.sendCommand({ type: "js-profile-start", name: options.name, samplingIntervalUs: parseInteger(options.interval) }), "Failed to start JS profile");
    console.log("JS profile started");
  });

  profile.command("stop").action(async () => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-stop" }), "Failed to stop JS profile");
    console.log(`JS profile stopped. Session ID: ${data as string}`);
  });

  profile.command("status").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-status" }), "Failed to get JS profile status");
    console.log(formatJsProfileStatus(data as Parameters<typeof formatJsProfileStatus>[0], getVerbose(command)));
  });

  profile.command("list").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-list-sessions", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }), "Failed to list JS profile sessions");
    console.log(formatJsSessionList(data as Parameters<typeof formatJsSessionList>[0], getVerbose(command)));
  });

  profile.command("summary").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-summary", sessionId: options.session }), "Failed to get JS profile summary");
    console.log(formatJsProfileSummary(data as Parameters<typeof formatJsProfileSummary>[0], getVerbose(command)));
  });

  profile.command("hotspots").option("--session <id>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").option("--min-self-ms <ms>").option("--include-runtime").action(async (options: Record<string, string | boolean | undefined>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({
        type: "js-profile-hotspots",
        sessionId: typeof options.session === "string" ? options.session : undefined,
        limit: parseInteger(typeof options.limit === "string" ? options.limit : undefined),
        offset: parseInteger(typeof options.offset === "string" ? options.offset : undefined),
        sortBy: typeof options.sort === "string" ? options.sort : undefined,
        minSelfMs: parseFloatNumber(typeof options.minSelfMs === "string" ? options.minSelfMs : undefined),
        includeRuntime: options.includeRuntime === true,
      }),
      "Failed to get JS profile hotspots",
    );
    console.log(formatJsHotspots(data as Parameters<typeof formatJsHotspots>[0], getVerbose(command)));
  });

  profile.command("hotspot").requiredOption("--id <id>").option("--session <id>").option("--stack-limit <n>").action(async (options: { id: string; session?: string; stackLimit?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-hotspot", hotspotId: options.id, sessionId: options.session, stackLimit: parseInteger(options.stackLimit) }), "Failed to get JS profile hotspot");
    console.log(formatJsHotspotDetail(data as Parameters<typeof formatJsHotspotDetail>[0], getVerbose(command)));
  });

  profile.command("modules").option("--session <id>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").action(async (options: { session?: string; limit?: string; offset?: string; sort?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-modules", sessionId: options.session, limit: parseInteger(options.limit), offset: parseInteger(options.offset), sortBy: options.sort }), "Failed to get JS profile modules");
    console.log(formatJsModules(data as Parameters<typeof formatJsModules>[0], getVerbose(command)));
  });

  profile.command("stacks").option("--session <id>").option("--limit <n>").option("--offset <n>").option("--min-ms <ms>").option("--max-depth <n>").action(async (options: { session?: string; limit?: string; offset?: string; minMs?: string; maxDepth?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-stacks", sessionId: options.session, limit: parseInteger(options.limit), offset: parseInteger(options.offset), minMs: parseFloatNumber(options.minMs), maxDepth: parseInteger(options.maxDepth) }), "Failed to get JS profile stacks");
    console.log(formatJsStacks(data as Parameters<typeof formatJsStacks>[0], getVerbose(command)));
  });

  profile.command("slice").requiredOption("--start <ms>").requiredOption("--end <ms>").option("--session <id>").option("--limit <n>").action(async (options: { start: string; end: string; session?: string; limit?: string }, command) => {
    await deps.ensureDaemon();
    const startMs = parseRequiredFloat(options.start, "Usage: agent-cdp js-profile slice --start MS --end MS");
    const endMs = parseRequiredFloat(options.end, "Usage: agent-cdp js-profile slice --start MS --end MS");
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-slice", startMs, endMs, sessionId: options.session, limit: parseInteger(options.limit) }), "Failed to get JS profile slice");
    console.log(formatJsSlice(data as Parameters<typeof formatJsSlice>[0], getVerbose(command)));
  });

  profile.command("diff").requiredOption("--base <id>").requiredOption("--compare <id>").option("--limit <n>").option("--min-delta-pct <pct>").action(async (options: { base: string; compare: string; limit?: string; minDeltaPct?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-diff", baseSessionId: options.base, compareSessionId: options.compare, limit: parseInteger(options.limit), minDeltaPct: parseFloatNumber(options.minDeltaPct) }), "Failed to diff JS profile sessions");
    console.log(formatJsDiff(data as Parameters<typeof formatJsDiff>[0], getVerbose(command)));
  });

  profile.command("export").option("--session <id>").action(async (options: { session?: string }) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-export", sessionId: options.session }), "Failed to export JS profile");
    console.log(JSON.stringify(data, null, 2));
  });

  profile.command("source-maps").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "js-profile-source-maps", sessionId: options.session }), "Failed to get source map info");
    console.log(formatJsSourceMaps(data as Parameters<typeof formatJsSourceMaps>[0], getVerbose(command)));
  });
}
