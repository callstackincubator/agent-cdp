import { ensureDaemon, readDaemonInfo, sendCommand, stopDaemon } from "./daemon-client.js";
import {
  formatConsoleList,
  formatConsoleMessage,
  formatMemorySummary,
  formatStatus,
  formatTargetList,
  formatTraceSummary,
} from "./formatters.js";
import {
  formatMemLeakCandidates,
  formatMemLeakTriplet,
  formatMemSnapshotClass,
  formatMemSnapshotClasses,
  formatMemSnapshotDiff,
  formatMemSnapshotInstance,
  formatMemSnapshotInstances,
  formatMemSnapshotList,
  formatMemSnapshotRetainers,
  formatMemSnapshotSummary,
} from "./heap-snapshot/formatters.js";
import {
  formatJsMemoryDiff,
  formatJsMemoryLeakSignal,
  formatJsMemoryList,
  formatJsMemorySample,
  formatJsMemorySummary,
  formatJsMemoryTrend,
} from "./js-memory/formatters.js";
import {
  formatJsDiff,
  formatJsHotspotDetail,
  formatJsHotspots,
  formatJsModules,
  formatJsProfileStatus,
  formatJsProfileSummary,
  formatJsSessionList,
  formatJsSlice,
  formatJsSourceMaps,
  formatJsStacks,
} from "./js-profiler/formatters.js";
import type {
  ConsoleMessage,
  DiscoveryOptions,
  MemorySnapshotSummary,
  StatusInfo,
  TargetDescriptor,
  TraceRecordingSummary,
} from "./types.js";

export function usage(): string {
  return `Usage: agent-cdp <command>

Daemon:
  start     Start daemon
  stop      Stop daemon
  status    Show daemon status

Targets:
  target list --url URL
  target select <id> --url URL
  target clear

Console:
  console list [--limit N]
  console get <id>

Trace:
  trace start
  trace stop [--file PATH]

Memory (raw capture):
  memory capture --file PATH

Heap Snapshot Analyzer:
  mem-snapshot capture [--name NAME] [--gc] [--file PATH]
  mem-snapshot load --file PATH [--name NAME]
  mem-snapshot list
  mem-snapshot summary [--snapshot ID]
  mem-snapshot classes [--snapshot ID] [--limit N] [--offset N] [--sort retained|self|count] [--filter TEXT]
  mem-snapshot class --id CLASS_ID [--snapshot ID]
  mem-snapshot instances --class CLASS_ID [--snapshot ID] [--limit N] [--offset N] [--sort retained|self]
  mem-snapshot instance --id NODE_ID [--snapshot ID]
  mem-snapshot retainers --id NODE_ID [--snapshot ID] [--depth N] [--limit N]
  mem-snapshot diff --base SNAPSHOT_ID --compare SNAPSHOT_ID [--sort retained|self|count] [--limit N]
  mem-snapshot leak-triplet --baseline ID --action ID --cleanup ID [--limit N]
  mem-snapshot leak-candidates [--snapshot ID] [--limit N]

JS Heap Usage Monitor:
  js-memory sample [--label LABEL] [--gc]
  js-memory list [--limit N] [--offset N]
  js-memory summary
  js-memory diff --base SAMPLE_ID --compare SAMPLE_ID
  js-memory trend [--limit N]
  js-memory leak-signal

JS Profiler:
  js-profile start [--name NAME] [--interval US]
  js-profile stop
  js-profile status
  js-profile list [--limit N] [--offset N]
  js-profile summary [--session ID]
  js-profile hotspots [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs] [--min-self-ms N] [--include-runtime]
  js-profile hotspot --id HOTSPOT_ID [--session ID] [--stack-limit N]
  js-profile modules [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs]
  js-profile stacks [--session ID] [--limit N] [--offset N] [--min-ms N] [--max-depth N]
  js-profile slice --start MS --end MS [--session ID] [--limit N]
  js-profile diff --base SESSION_ID --compare SESSION_ID [--limit N] [--min-delta-pct N]
  js-profile export [--session ID]
  js-profile source-maps [--session ID]`;
}

export function parseArgs(argv: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      command.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
      continue;
    }

    flags[key] = true;
  }

  return { command, flags };
}

function readStatusInfo(data: unknown): StatusInfo {
  return data as StatusInfo;
}

function readTargets(data: unknown): TargetDescriptor[] {
  return data as TargetDescriptor[];
}

function readConsoleMessages(data: unknown): ConsoleMessage[] {
  return data as ConsoleMessage[];
}

function readConsoleMessage(data: unknown): ConsoleMessage {
  return data as ConsoleMessage;
}

function readTraceSummary(data: unknown): TraceRecordingSummary {
  return data as TraceRecordingSummary;
}

function readMemorySummary(data: unknown): MemorySnapshotSummary {
  return data as MemorySnapshotSummary;
}

function discoveryOptionsFromFlags(flags: Record<string, string | boolean>): DiscoveryOptions {
  return {
    url: typeof flags.url === "string" ? flags.url : undefined,
  };
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cmd = command[0];

  if (!cmd || cmd === "help") {
    console.log(usage());
    return;
  }

  if (cmd === "start") {
    await ensureDaemon();
    const response = await sendCommand({ type: "status" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to load daemon status");
    }
    console.log(formatStatus(readStatusInfo(response.data)));
    return;
  }

  if (cmd === "stop") {
    console.log(stopDaemon() ? "Daemon stopped" : "Daemon is not running");
    return;
  }

  if (cmd === "status") {
    const info = readDaemonInfo();
    if (!info) {
      console.log("Daemon is not running");
      process.exit(1);
    }

    const response = await sendCommand({ type: "status" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to load daemon status");
    }
    console.log(formatStatus(readStatusInfo(response.data)));
    return;
  }

  if (cmd === "target" && command[1] === "list") {
    await ensureDaemon();
    const response = await sendCommand({
      type: "list-targets",
      options: discoveryOptionsFromFlags(flags),
    });
    if (!response.ok) {
      throw new Error(response.error || "Failed to list targets");
    }
    console.log(formatTargetList(readTargets(response.data)));
    return;
  }

  if (cmd === "target" && command[1] === "select") {
    const targetId = command[2];
    if (!targetId) {
      throw new Error("Usage: agent-cdp target select <id> --url URL");
    }
    await ensureDaemon();
    const response = await sendCommand({
      type: "select-target",
      targetId,
      options: discoveryOptionsFromFlags(flags),
    });
    if (!response.ok) {
      throw new Error(response.error || "Failed to select target");
    }
    console.log(`Selected target: ${targetId}`);
    return;
  }

  if (cmd === "target" && command[1] === "clear") {
    await ensureDaemon();
    const response = await sendCommand({ type: "clear-target" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to clear target");
    }
    console.log("Target cleared");
    return;
  }

  if (cmd === "console" && command[1] === "list") {
    await ensureDaemon();
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const response = await sendCommand({ type: "list-console-messages", limit });
    if (!response.ok) {
      throw new Error(response.error || "Failed to list console messages");
    }
    console.log(formatConsoleList(readConsoleMessages(response.data)));
    return;
  }

  if (cmd === "console" && command[1] === "get") {
    const rawId = command[2];
    const id = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (Number.isNaN(id)) {
      throw new Error("Usage: agent-cdp console get <id>");
    }
    await ensureDaemon();
    const response = await sendCommand({ type: "get-console-message", id });
    if (!response.ok) {
      throw new Error(response.error || "Failed to get console message");
    }
    console.log(formatConsoleMessage(readConsoleMessage(response.data)));
    return;
  }

  if (cmd === "trace" && command[1] === "start") {
    await ensureDaemon();
    const response = await sendCommand({ type: "start-trace" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to start trace");
    }
    console.log("Trace started");
    return;
  }

  if (cmd === "trace" && command[1] === "stop") {
    await ensureDaemon();
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    const response = await sendCommand({ type: "stop-trace", filePath });
    if (!response.ok) {
      throw new Error(response.error || "Failed to stop trace");
    }
    console.log(formatTraceSummary(readTraceSummary(response.data)));
    return;
  }

  if (cmd === "memory" && command[1] === "capture") {
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    if (!filePath) {
      throw new Error("Usage: agent-cdp memory capture --file PATH");
    }
    await ensureDaemon();
    const response = await sendCommand({ type: "capture-memory", filePath });
    if (!response.ok) {
      throw new Error(response.error || "Failed to capture heap snapshot");
    }
    console.log(formatMemorySummary(readMemorySummary(response.data)));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "capture") {
    const name = typeof flags.name === "string" ? flags.name : undefined;
    const collectGarbage = flags.gc === true;
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-capture", name, collectGarbage, filePath });
    if (!response.ok) throw new Error(response.error || "Failed to capture heap snapshot");
    console.log(JSON.stringify(response.data, null, 2));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "load") {
    const filePath = typeof flags.file === "string" ? flags.file : undefined;
    if (!filePath) throw new Error("Usage: agent-cdp mem-snapshot load --file PATH");
    const name = typeof flags.name === "string" ? flags.name : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-load", filePath, name });
    if (!response.ok) throw new Error(response.error || "Failed to load heap snapshot");
    console.log(JSON.stringify(response.data, null, 2));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "list") {
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-list" });
    if (!response.ok) throw new Error(response.error || "Failed to list heap snapshots");
    console.log(formatMemSnapshotList(response.data as Parameters<typeof formatMemSnapshotList>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "summary") {
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-summary", snapshotId });
    if (!response.ok) throw new Error(response.error || "Failed to get snapshot summary");
    console.log(formatMemSnapshotSummary(response.data as Parameters<typeof formatMemSnapshotSummary>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "classes") {
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    const sortBy = typeof flags.sort === "string" ? flags.sort : undefined;
    const filter = typeof flags.filter === "string" ? flags.filter : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-classes", snapshotId, sortBy, limit, offset, filter });
    if (!response.ok) throw new Error(response.error || "Failed to get snapshot classes");
    console.log(formatMemSnapshotClasses(response.data as Parameters<typeof formatMemSnapshotClasses>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "class") {
    const classId = typeof flags.id === "string" ? flags.id : undefined;
    if (!classId) throw new Error("Usage: agent-cdp mem-snapshot class --id CLASS_ID");
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-class", classId, snapshotId });
    if (!response.ok) throw new Error(response.error || "Failed to get class details");
    console.log(formatMemSnapshotClass(response.data as Parameters<typeof formatMemSnapshotClass>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "instances") {
    const classId = typeof flags.class === "string" ? flags.class : undefined;
    if (!classId) throw new Error("Usage: agent-cdp mem-snapshot instances --class CLASS_ID");
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    const sortBy = typeof flags.sort === "string" ? flags.sort : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-instances", classId, snapshotId, limit, offset, sortBy });
    if (!response.ok) throw new Error(response.error || "Failed to get instances");
    console.log(formatMemSnapshotInstances(response.data as Parameters<typeof formatMemSnapshotInstances>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "instance") {
    const rawNodeId = typeof flags.id === "string" ? Number.parseInt(flags.id, 10) : Number.NaN;
    if (Number.isNaN(rawNodeId)) throw new Error("Usage: agent-cdp mem-snapshot instance --id NODE_ID");
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-instance", nodeId: rawNodeId, snapshotId });
    if (!response.ok) throw new Error(response.error || "Failed to get instance");
    console.log(formatMemSnapshotInstance(response.data as Parameters<typeof formatMemSnapshotInstance>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "retainers") {
    const rawNodeId = typeof flags.id === "string" ? Number.parseInt(flags.id, 10) : Number.NaN;
    if (Number.isNaN(rawNodeId)) throw new Error("Usage: agent-cdp mem-snapshot retainers --id NODE_ID");
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    const depth = typeof flags.depth === "string" ? Number.parseInt(flags.depth, 10) : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-retainers", nodeId: rawNodeId, snapshotId, depth, limit });
    if (!response.ok) throw new Error(response.error || "Failed to get retainers");
    console.log(formatMemSnapshotRetainers(response.data as Parameters<typeof formatMemSnapshotRetainers>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "diff") {
    const baseSnapshotId = typeof flags.base === "string" ? flags.base : undefined;
    const compareSnapshotId = typeof flags.compare === "string" ? flags.compare : undefined;
    if (!baseSnapshotId || !compareSnapshotId) {
      throw new Error("Usage: agent-cdp mem-snapshot diff --base SNAPSHOT_ID --compare SNAPSHOT_ID");
    }
    const sortBy = typeof flags.sort === "string" ? flags.sort : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-diff", baseSnapshotId, compareSnapshotId, sortBy, limit });
    if (!response.ok) throw new Error(response.error || "Failed to diff snapshots");
    console.log(formatMemSnapshotDiff(response.data as Parameters<typeof formatMemSnapshotDiff>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "leak-triplet") {
    const baselineSnapshotId = typeof flags.baseline === "string" ? flags.baseline : undefined;
    const actionSnapshotId = typeof flags.action === "string" ? flags.action : undefined;
    const cleanupSnapshotId = typeof flags.cleanup === "string" ? flags.cleanup : undefined;
    if (!baselineSnapshotId || !actionSnapshotId || !cleanupSnapshotId) {
      throw new Error("Usage: agent-cdp mem-snapshot leak-triplet --baseline ID --action ID --cleanup ID");
    }
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({
      type: "mem-snapshot-leak-triplet",
      baselineSnapshotId,
      actionSnapshotId,
      cleanupSnapshotId,
      limit,
    });
    if (!response.ok) throw new Error(response.error || "Failed to analyze leak triplet");
    console.log(formatMemLeakTriplet(response.data as Parameters<typeof formatMemLeakTriplet>[0]));
    return;
  }

  if (cmd === "mem-snapshot" && command[1] === "leak-candidates") {
    const snapshotId = typeof flags.snapshot === "string" ? flags.snapshot : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "mem-snapshot-leak-candidates", snapshotId, limit });
    if (!response.ok) throw new Error(response.error || "Failed to get leak candidates");
    console.log(formatMemLeakCandidates(response.data as Parameters<typeof formatMemLeakCandidates>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "sample") {
    const label = typeof flags.label === "string" ? flags.label : undefined;
    const collectGarbage = flags.gc === true;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-sample", label, collectGarbage });
    if (!response.ok) throw new Error(response.error || "Failed to capture heap usage sample");
    console.log(formatJsMemorySample(response.data as Parameters<typeof formatJsMemorySample>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "list") {
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-list", limit, offset });
    if (!response.ok) throw new Error(response.error || "Failed to list JS memory samples");
    console.log(formatJsMemoryList(response.data as Parameters<typeof formatJsMemoryList>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "summary") {
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-summary" });
    if (!response.ok) throw new Error(response.error || "Failed to get JS memory summary");
    console.log(formatJsMemorySummary(response.data as Parameters<typeof formatJsMemorySummary>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "diff") {
    const baseSampleId = typeof flags.base === "string" ? flags.base : undefined;
    const compareSampleId = typeof flags.compare === "string" ? flags.compare : undefined;
    if (!baseSampleId || !compareSampleId) {
      throw new Error("Usage: agent-cdp js-memory diff --base SAMPLE_ID --compare SAMPLE_ID");
    }
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-diff", baseSampleId, compareSampleId });
    if (!response.ok) throw new Error(response.error || "Failed to diff JS memory samples");
    console.log(formatJsMemoryDiff(response.data as Parameters<typeof formatJsMemoryDiff>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "trend") {
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-trend", limit });
    if (!response.ok) throw new Error(response.error || "Failed to get JS memory trend");
    console.log(formatJsMemoryTrend(response.data as Parameters<typeof formatJsMemoryTrend>[0]));
    return;
  }

  if (cmd === "js-memory" && command[1] === "leak-signal") {
    await ensureDaemon();
    const response = await sendCommand({ type: "js-memory-leak-signal" });
    if (!response.ok) throw new Error(response.error || "Failed to get JS memory leak signal");
    console.log(formatJsMemoryLeakSignal(response.data as Parameters<typeof formatJsMemoryLeakSignal>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "start") {
    const name = typeof flags.name === "string" ? flags.name : undefined;
    const samplingIntervalUs =
      typeof flags.interval === "string" ? Number.parseInt(flags.interval, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-start", name, samplingIntervalUs });
    if (!response.ok) throw new Error(response.error || "Failed to start JS profile");
    console.log("JS profile started");
    return;
  }

  if (cmd === "js-profile" && command[1] === "stop") {
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-stop" });
    if (!response.ok) throw new Error(response.error || "Failed to stop JS profile");
    console.log(`JS profile stopped. Session ID: ${response.data as string}`);
    return;
  }

  if (cmd === "js-profile" && command[1] === "status") {
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-status" });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile status");
    console.log(formatJsProfileStatus(response.data as Parameters<typeof formatJsProfileStatus>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "list") {
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-list-sessions", limit, offset });
    if (!response.ok) throw new Error(response.error || "Failed to list JS profile sessions");
    console.log(formatJsSessionList(response.data as Parameters<typeof formatJsSessionList>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "summary") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-summary", sessionId });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile summary");
    console.log(formatJsProfileSummary(response.data as Parameters<typeof formatJsProfileSummary>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "hotspots") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    const sortBy = typeof flags.sort === "string" ? flags.sort : undefined;
    const minSelfMs = typeof flags["min-self-ms"] === "string" ? Number.parseFloat(flags["min-self-ms"]) : undefined;
    const includeRuntime = flags["include-runtime"] === true;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-hotspots", sessionId, limit, offset, sortBy, minSelfMs, includeRuntime });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile hotspots");
    console.log(formatJsHotspots(response.data as Parameters<typeof formatJsHotspots>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "hotspot") {
    const hotspotId = typeof flags.id === "string" ? flags.id : undefined;
    if (!hotspotId) throw new Error("Usage: agent-cdp js-profile hotspot --id HOTSPOT_ID");
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    const stackLimit = typeof flags["stack-limit"] === "string" ? Number.parseInt(flags["stack-limit"], 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-hotspot", hotspotId, sessionId, stackLimit });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile hotspot");
    console.log(formatJsHotspotDetail(response.data as Parameters<typeof formatJsHotspotDetail>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "modules") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    const sortBy = typeof flags.sort === "string" ? flags.sort : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-modules", sessionId, limit, offset, sortBy });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile modules");
    console.log(formatJsModules(response.data as Parameters<typeof formatJsModules>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "stacks") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const offset = typeof flags.offset === "string" ? Number.parseInt(flags.offset, 10) : undefined;
    const minMs = typeof flags["min-ms"] === "string" ? Number.parseFloat(flags["min-ms"]) : undefined;
    const maxDepth = typeof flags["max-depth"] === "string" ? Number.parseInt(flags["max-depth"], 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-stacks", sessionId, limit, offset, minMs, maxDepth });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile stacks");
    console.log(formatJsStacks(response.data as Parameters<typeof formatJsStacks>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "slice") {
    const startMs = typeof flags.start === "string" ? Number.parseFloat(flags.start) : Number.NaN;
    const endMs = typeof flags.end === "string" ? Number.parseFloat(flags.end) : Number.NaN;
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error("Usage: agent-cdp js-profile slice --start MS --end MS");
    }
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-slice", startMs, endMs, sessionId, limit });
    if (!response.ok) throw new Error(response.error || "Failed to get JS profile slice");
    console.log(formatJsSlice(response.data as Parameters<typeof formatJsSlice>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "diff") {
    const baseSessionId = typeof flags.base === "string" ? flags.base : undefined;
    const compareSessionId = typeof flags.compare === "string" ? flags.compare : undefined;
    if (!baseSessionId || !compareSessionId) {
      throw new Error("Usage: agent-cdp js-profile diff --base SESSION_ID --compare SESSION_ID");
    }
    const limit = typeof flags.limit === "string" ? Number.parseInt(flags.limit, 10) : undefined;
    const minDeltaPct =
      typeof flags["min-delta-pct"] === "string" ? Number.parseFloat(flags["min-delta-pct"]) : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-diff", baseSessionId, compareSessionId, limit, minDeltaPct });
    if (!response.ok) throw new Error(response.error || "Failed to diff JS profile sessions");
    console.log(formatJsDiff(response.data as Parameters<typeof formatJsDiff>[0]));
    return;
  }

  if (cmd === "js-profile" && command[1] === "export") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-export", sessionId });
    if (!response.ok) throw new Error(response.error || "Failed to export JS profile");
    console.log(JSON.stringify(response.data, null, 2));
    return;
  }

  if (cmd === "js-profile" && command[1] === "source-maps") {
    const sessionId = typeof flags.session === "string" ? flags.session : undefined;
    await ensureDaemon();
    const response = await sendCommand({ type: "js-profile-source-maps", sessionId });
    if (!response.ok) throw new Error(response.error || "Failed to get source map info");
    console.log(formatJsSourceMaps(response.data as Parameters<typeof formatJsSourceMaps>[0]));
    return;
  }

  console.error(usage());
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
