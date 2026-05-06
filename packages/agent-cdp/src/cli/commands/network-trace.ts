import { Command } from "commander";
import { formatNetworkBody, formatNetworkHeaders, formatNetworkList, formatNetworkRequest, formatNetworkSessions, formatNetworkStatus, formatNetworkSummary } from "../../network/formatters.js";
import { formatTraceEntries, formatTraceEntry, formatTraceSessionList, formatTraceSessionSummary, formatTraceStatus, formatTraceStop, formatTraceTracks } from "../../trace/formatters.js";
import type { TraceEntriesResult, TraceEntry, TraceSessionListEntry, TraceStatusResult, TraceStopResult, TraceSummaryResult, TraceTracksResult } from "../../trace/types.js";
import type { CliDeps } from "../context.js";
import { ensureTargetSelected } from "../context.js";
import { getVerbose, parseFloatNumber, parseInteger, unwrapResponse } from "../shared.js";

function readTraceStatus(data: unknown): TraceStatusResult {
  return data as TraceStatusResult;
}

function readTraceStop(data: unknown): TraceStopResult {
  return data as TraceStopResult;
}

function readTraceSessionList(data: unknown): TraceSessionListEntry[] {
  return data as TraceSessionListEntry[];
}

function readTraceSessionSummary(data: unknown): TraceSummaryResult {
  return data as TraceSummaryResult;
}

function readTraceTracks(data: unknown): TraceTracksResult {
  return data as TraceTracksResult;
}

function readTraceEntries(data: unknown): TraceEntriesResult {
  return data as TraceEntriesResult;
}

function readTraceEntry(data: unknown): TraceEntry {
  return data as TraceEntry;
}

export function registerNetworkAndTraceCommands(program: Command, deps: CliDeps): void {
  const network = program.command("network").description("Network inspection commands");

  network.command("status").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "network-status" }), "Failed to get network status");
    console.log(formatNetworkStatus(data as Parameters<typeof formatNetworkStatus>[0], getVerbose(command)));
  });

  network
    .command("start")
    .option("--name <name>")
    .option("--preserve-across-navigation")
    .action(async (options: { name?: string; preserveAcrossNavigation?: boolean }) => {
      await ensureTargetSelected(deps);
      const data = unwrapResponse(
        await deps.sendCommand({
          type: "network-start",
          name: options.name,
          preserveAcrossNavigation: options.preserveAcrossNavigation === true,
        }),
        "Failed to start network session",
      );
      console.log(`Network session started. Session ID: ${data as string}`);
    });

  network.command("stop").action(async () => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "network-stop" }), "Failed to stop network session");
    console.log(`Network session stopped. Session ID: ${data as string}`);
  });

  network.command("sessions").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-list-sessions", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }),
      "Failed to list network sessions",
    );
    console.log(formatNetworkSessions(data as Parameters<typeof formatNetworkSessions>[0], getVerbose(command)));
  });

  network.command("summary").option("--session <id>").action(async (options: { session?: string }, command) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(await deps.sendCommand({ type: "network-summary", sessionId: options.session }), "Failed to summarize network requests");
    console.log(formatNetworkSummary(data as Parameters<typeof formatNetworkSummary>[0], getVerbose(command)));
  });

  network
    .command("list")
    .option("--session <id>")
    .option("--limit <n>")
    .option("--offset <n>")
    .option("--type <type>")
    .option("--status <status>")
    .option("--method <method>")
    .option("--text <text>")
    .option("--min-ms <ms>")
    .option("--max-ms <ms>")
    .option("--min-bytes <bytes>")
    .option("--max-bytes <bytes>")
    .action(async (options: Record<string, string | undefined>) => {
      await ensureTargetSelected(deps);
      const data = unwrapResponse(
        await deps.sendCommand({
          type: "network-list",
          sessionId: options.session,
          limit: parseInteger(options.limit),
          offset: parseInteger(options.offset),
          resourceType: options.type,
          status: options.status,
          method: options.method,
          text: options.text,
          minMs: parseFloatNumber(options.minMs),
          maxMs: parseFloatNumber(options.maxMs),
          minBytes: parseInteger(options.minBytes),
          maxBytes: parseInteger(options.maxBytes),
        }),
        "Failed to list network requests",
      );
      console.log(formatNetworkList(data as Parameters<typeof formatNetworkList>[0]));
    });

  network.command("request").requiredOption("--id <id>").option("--session <id>").action(async (options: { id: string; session?: string }, command) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-request", requestId: options.id, sessionId: options.session }),
      "Failed to get network request",
    );
    console.log(formatNetworkRequest(data as Parameters<typeof formatNetworkRequest>[0], getVerbose(command)));
  });

  network.command("request-headers").requiredOption("--id <id>").option("--session <id>").option("--name <name>").action(async (options: { id: string; session?: string; name?: string }) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-request-headers", requestId: options.id, sessionId: options.session, name: options.name }),
      "Failed to get request headers",
    );
    console.log(formatNetworkHeaders(data as Parameters<typeof formatNetworkHeaders>[0]));
  });

  network.command("response-headers").requiredOption("--id <id>").option("--session <id>").option("--name <name>").action(async (options: { id: string; session?: string; name?: string }) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-response-headers", requestId: options.id, sessionId: options.session, name: options.name }),
      "Failed to get response headers",
    );
    console.log(formatNetworkHeaders(data as Parameters<typeof formatNetworkHeaders>[0]));
  });

  network.command("request-body").requiredOption("--id <id>").option("--session <id>").option("--file <path>").action(async (options: { id: string; session?: string; file?: string }) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-request-body", requestId: options.id, sessionId: options.session, filePath: options.file }),
      "Failed to get request body",
    );
    console.log(formatNetworkBody(data as Parameters<typeof formatNetworkBody>[0]));
  });

  network.command("response-body").requiredOption("--id <id>").option("--session <id>").option("--file <path>").action(async (options: { id: string; session?: string; file?: string }) => {
    await ensureTargetSelected(deps);
    const data = unwrapResponse(
      await deps.sendCommand({ type: "network-response-body", requestId: options.id, sessionId: options.session, filePath: options.file }),
      "Failed to get response body",
    );
    console.log(formatNetworkBody(data as Parameters<typeof formatNetworkBody>[0]));
  });

  const trace = program.command("trace").description("Trace commands");

  trace.command("start").action(async () => {
    await ensureTargetSelected(deps);
    unwrapResponse(await deps.sendCommand({ type: "start-trace" }), "Failed to start trace");
    console.log("Trace started");
  });

  trace.command("stop").option("--file <path>").action(async (options: { file?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "stop-trace", filePath: options.file }), "Failed to stop trace");
    console.log(formatTraceStop(readTraceStop(data), getVerbose(command)));
  });

  trace.command("status").action(async (_options, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "trace-status" }), "Failed to get trace status");
    console.log(formatTraceStatus(readTraceStatus(data), getVerbose(command)));
  });

  trace.command("list").option("--limit <n>").option("--offset <n>").action(async (options: { limit?: string; offset?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "trace-list-sessions", limit: parseInteger(options.limit), offset: parseInteger(options.offset) }),
      "Failed to list trace sessions",
    );
    console.log(formatTraceSessionList(readTraceSessionList(data), getVerbose(command)));
  });

  trace.command("summary").option("--session <id>").action(async (options: { session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(await deps.sendCommand({ type: "trace-summary", sessionId: options.session }), "Failed to get trace summary");
    console.log(formatTraceSessionSummary(readTraceSessionSummary(data), getVerbose(command)));
  });

  trace.command("tracks").option("--session <id>").option("--limit <n>").option("--offset <n>").option("--text <text>").option("--group <group>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({
        type: "trace-tracks",
        sessionId: options.session,
        limit: parseInteger(options.limit),
        offset: parseInteger(options.offset),
        text: options.text,
        group: options.group,
      }),
      "Failed to get trace tracks",
    );
    console.log(formatTraceTracks(readTraceTracks(data), getVerbose(command)));
  });

  trace.command("entries").option("--session <id>").option("--track <track>").option("--type <type>").option("--text <text>").option("--start-ms <ms>").option("--end-ms <ms>").option("--limit <n>").option("--offset <n>").option("--sort <sort>").action(async (options: Record<string, string | undefined>, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({
        type: "trace-entries",
        sessionId: options.session,
        track: options.track,
        typeFilter: (options.type || "measure") as "measure" | "mark" | "stamp",
        text: options.text,
        startMs: parseFloatNumber(options.startMs),
        endMs: parseFloatNumber(options.endMs),
        limit: parseInteger(options.limit),
        offset: parseInteger(options.offset),
        sortBy: options.sort as "time" | "duration" | "name" | undefined,
      }),
      "Failed to get trace entries",
    );
    console.log(formatTraceEntries(readTraceEntries(data), getVerbose(command)));
  });

  trace.command("entry").requiredOption("--id <id>").option("--session <id>").action(async (options: { id: string; session?: string }, command) => {
    await deps.ensureDaemon();
    const data = unwrapResponse(
      await deps.sendCommand({ type: "trace-entry", sessionId: options.session, entryId: options.id }),
      "Failed to get trace entry",
    );
    console.log(formatTraceEntry(readTraceEntry(data), getVerbose(command)));
  });
}
