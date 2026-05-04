import type {
  MemLeakCandidatesResult,
  MemLeakTripletResult,
  MemSnapshotClassResult,
  MemSnapshotClassesResult,
  MemSnapshotDiffResult,
  MemSnapshotInstanceResult,
  MemSnapshotInstancesResult,
  MemSnapshotMeta,
  MemSnapshotRetainersResult,
  MemSnapshotSummaryResult,
} from "./types.js";

export function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const abs = Math.abs(n);
  if (abs >= 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (abs >= 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${n} B`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

export function formatMemSnapshotList(entries: MemSnapshotMeta[]): string {
  if (entries.length === 0) return "No heap snapshots captured.";

  const lines = [`Heap Snapshots (${entries.length}):`];
  lines.push(
    `  ${"ID".padEnd(12)} ${"NAME".padEnd(20)} ${"NODES".padStart(8)}  ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}  CAPTURED`,
  );
  for (const e of entries) {
    const date = fmtDate(e.capturedAt);
    lines.push(
      `  ${e.snapshotId.padEnd(12)} ${e.name.slice(0, 20).padEnd(20)} ${String(e.nodeCount).padStart(8)}  ${formatBytes(e.totalSelfSize).padStart(10)}  ${formatBytes(e.totalRetainedSize).padStart(10)}  ${date}`,
    );
  }
  return lines.join("\n");
}

export function formatMemSnapshotSummary(result: MemSnapshotSummaryResult): string {
  const lines: string[] = [];
  lines.push(`Snapshot: ${result.name} (${result.snapshotId}) — ${fmtDate(result.capturedAt)}`);
  lines.push(`  Nodes: ${result.nodeCount.toLocaleString()}`);
  lines.push(`  Total self size: ${formatBytes(result.totalSelfSize)}`);
  lines.push(`  Total retained size: ${formatBytes(result.totalRetainedSize)}`);

  if (result.topByRetained.length > 0) {
    lines.push("");
    lines.push("Top classes by retained size:");
    lines.push(
      `  ${"CLASS ID".padEnd(8)} ${"CLASS NAME".padEnd(30)} ${"COUNT".padStart(8)}  ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}  RET%  FLAGS`,
    );
    for (const cls of result.topByRetained) {
      const flags = cls.suspicionFlags.length > 0 ? cls.suspicionFlags.join(",") : "";
      lines.push(
        `  ${cls.classId.padEnd(8)} ${cls.className.slice(0, 30).padEnd(30)} ${String(cls.count).padStart(8)}  ${formatBytes(cls.selfSize).padStart(10)}  ${formatBytes(cls.retainedSize).padStart(10)}  ${String(cls.retainedPercent).padStart(4)}%  ${flags}`,
      );
    }
  }

  if (result.topByCount.length > 0) {
    lines.push("");
    lines.push("Top classes by instance count:");
    lines.push(
      `  ${"CLASS ID".padEnd(8)} ${"CLASS NAME".padEnd(30)} ${"COUNT".padStart(8)}  ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}`,
    );
    for (const cls of result.topByCount) {
      lines.push(
        `  ${cls.classId.padEnd(8)} ${cls.className.slice(0, 30).padEnd(30)} ${String(cls.count).padStart(8)}  ${formatBytes(cls.selfSize).padStart(10)}  ${formatBytes(cls.retainedSize).padStart(10)}`,
      );
    }
  }

  if (result.suspiciousClasses.length > 0) {
    lines.push("");
    lines.push(`Suspicious classes (${result.suspiciousClasses.length}):`);
    for (const cls of result.suspiciousClasses) {
      lines.push(`  ${cls.classId.padEnd(8)} ${cls.className.slice(0, 30).padEnd(30)}  flags: ${cls.suspicionFlags.join(", ")}`);
    }
  }

  if (result.caveats.length > 0) {
    lines.push("");
    lines.push("Caveats:");
    for (const c of result.caveats) lines.push(`  - ${c}`);
  }

  return lines.join("\n");
}

export function formatMemSnapshotClasses(result: MemSnapshotClassesResult): string {
  const lines: string[] = [];
  lines.push(
    `Classes — snapshot ${result.snapshotId} (${result.total} total, offset ${result.offset}, showing ${result.items.length}):`,
  );

  if (result.items.length === 0) {
    lines.push("  No classes match the current filters.");
    return lines.join("\n");
  }

  lines.push(
    `  ${"ID".padEnd(8)} ${"NAME".padEnd(30)} ${"COUNT".padStart(8)}  ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}  FLAGS`,
  );
  for (const cls of result.items) {
    const flags = cls.suspicionFlags.length > 0 ? cls.suspicionFlags.join(",") : "";
    lines.push(
      `  ${cls.classId.padEnd(8)} ${cls.className.slice(0, 30).padEnd(30)} ${String(cls.count).padStart(8)}  ${formatBytes(cls.selfSize).padStart(10)}  ${formatBytes(cls.retainedSize).padStart(10)}  ${flags}`,
    );
  }
  return lines.join("\n");
}

export function formatMemSnapshotClass(result: MemSnapshotClassResult): string {
  const lines: string[] = [];
  const agg = result.aggregate;
  lines.push(`Class: ${agg.className} (${agg.classId}) — type: ${agg.type}`);
  lines.push(`  Count: ${agg.count.toLocaleString()}`);
  lines.push(`  Self size: ${formatBytes(agg.selfSize)}`);
  lines.push(`  Retained size: ${formatBytes(agg.retainedSize)} (${agg.retainedPercent}%)`);

  if (agg.suspicionFlags.length > 0) {
    lines.push(`  Suspicion: ${agg.suspicionFlags.join(", ")}`);
  }

  if (result.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of result.notes) lines.push(`  - ${note}`);
  }

  if (result.topInstances.length > 0) {
    lines.push("");
    lines.push("Top instances by retained size:");
    lines.push(`  ${"NODE ID".padStart(10)}  ${"NAME".padEnd(24)} ${"TYPE".padEnd(12)} ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}  DIST`);
    for (const inst of result.topInstances) {
      lines.push(
        `  ${String(inst.nodeId).padStart(10)}  ${inst.name.slice(0, 24).padEnd(24)} ${inst.type.slice(0, 12).padEnd(12)} ${formatBytes(inst.selfSize).padStart(10)}  ${formatBytes(inst.retainedSize).padStart(10)}  ${inst.distance}`,
      );
    }
  }

  return lines.join("\n");
}

export function formatMemSnapshotInstances(result: MemSnapshotInstancesResult): string {
  const lines: string[] = [];
  lines.push(
    `Instances — class ${result.classId} in snapshot ${result.snapshotId} (${result.total} total, offset ${result.offset}):`,
  );

  if (result.items.length === 0) {
    lines.push("  No instances.");
    return lines.join("\n");
  }

  lines.push(`  ${"NODE ID".padStart(10)}  ${"NAME".padEnd(24)} ${"TYPE".padEnd(12)} ${"SELF".padStart(10)}  ${"RETAINED".padStart(10)}  DIST`);
  for (const inst of result.items) {
    lines.push(
      `  ${String(inst.nodeId).padStart(10)}  ${inst.name.slice(0, 24).padEnd(24)} ${inst.type.slice(0, 12).padEnd(12)} ${formatBytes(inst.selfSize).padStart(10)}  ${formatBytes(inst.retainedSize).padStart(10)}  ${inst.distance}`,
    );
  }
  return lines.join("\n");
}

export function formatMemSnapshotInstance(result: MemSnapshotInstanceResult): string {
  const lines: string[] = [];
  lines.push(`Node ${result.nodeId} — ${result.name} (${result.type})`);
  lines.push(`  Snapshot: ${result.snapshotId}`);
  lines.push(`  Self size: ${formatBytes(result.selfSize)}`);
  lines.push(`  Retained size: ${formatBytes(result.retainedSize)}`);
  lines.push(`  Distance from root: ${result.distance}`);
  lines.push(`  Out-edges: ${result.edgeCount} (showing ${result.outEdges.length})`);

  if (result.outEdges.length > 0) {
    lines.push("");
    lines.push("  Out-edges:");
    lines.push(`  ${"EDGE TYPE".padEnd(12)} ${"EDGE NAME".padEnd(20)} ${"TARGET ID".padStart(10)}  ${"TARGET NAME".padEnd(24)} ${"TARGET TYPE".padEnd(12)} ${"SELF".padStart(10)}`);
    for (const e of result.outEdges) {
      lines.push(
        `  ${e.edgeType.slice(0, 12).padEnd(12)} ${e.edgeName.slice(0, 20).padEnd(20)} ${String(e.targetNodeId).padStart(10)}  ${e.targetName.slice(0, 24).padEnd(24)} ${e.targetType.slice(0, 12).padEnd(12)} ${formatBytes(e.targetSelfSize).padStart(10)}`,
      );
    }
  }

  return lines.join("\n");
}

export function formatMemSnapshotRetainers(result: MemSnapshotRetainersResult): string {
  const lines: string[] = [];
  lines.push(`Retainer paths for node ${result.nodeId} — snapshot ${result.snapshotId}:`);

  if (result.paths.length === 0) {
    lines.push("  No retainer paths found (root or unreachable node).");
    return lines.join("\n");
  }

  for (let i = 0; i < result.paths.length; i++) {
    const path = result.paths[i];
    lines.push(`  Path ${i + 1}:`);
    for (let j = 0; j < path.length; j++) {
      const node = path[j];
      const indent = "  ".repeat(j + 2);
      const edgeLabel = node.edgeName ? ` .${node.edgeName}` : "";
      lines.push(`${indent}[${node.type}] ${node.name || "(anonymous)"} (id=${node.nodeId})${edgeLabel}`);
    }
  }

  return lines.join("\n");
}

export function formatMemSnapshotDiff(result: MemSnapshotDiffResult): string {
  const lines: string[] = [];
  lines.push(`Diff: ${result.baseSnapshotId} → ${result.compareSnapshotId}`);

  function printSection(label: string, rows: typeof result.grew): void {
    if (rows.length === 0) return;
    lines.push("");
    lines.push(`${label} (${rows.length}):`);
    lines.push(
      `  ${"CLASS NAME".padEnd(30)} ${"TYPE".padEnd(10)} ${"CNT DELTA".padStart(10)}  ${"SELF DELTA".padStart(12)}  ${"RET DELTA".padStart(12)}`,
    );
    for (const r of rows) {
      const countSign = r.countDelta >= 0 ? "+" : "";
      const selfSign = r.selfSizeDelta >= 0 ? "+" : "";
      const retSign = r.retainedSizeDelta >= 0 ? "+" : "";
      lines.push(
        `  ${r.className.slice(0, 30).padEnd(30)} ${r.type.slice(0, 10).padEnd(10)} ${(countSign + r.countDelta).padStart(10)}  ${(selfSign + formatBytes(r.selfSizeDelta)).padStart(12)}  ${(retSign + formatBytes(r.retainedSizeDelta)).padStart(12)}`,
      );
    }
  }

  printSection("Grew", result.grew);
  printSection("Shrank", result.shrank);
  printSection("Appeared", result.appeared);
  printSection("Disappeared", result.disappeared);

  if (
    result.grew.length === 0 &&
    result.shrank.length === 0 &&
    result.appeared.length === 0 &&
    result.disappeared.length === 0
  ) {
    lines.push("  No significant class changes detected.");
  }

  if (result.caveats.length > 0) {
    lines.push("");
    lines.push("Caveats:");
    for (const c of result.caveats) lines.push(`  - ${c}`);
  }

  return lines.join("\n");
}

export function formatMemLeakTriplet(result: MemLeakTripletResult): string {
  const lines: string[] = [];
  lines.push(`Leak Triplet Analysis:`);
  lines.push(`  Baseline: ${result.baselineSnapshotId}`);
  lines.push(`  Action:   ${result.actionSnapshotId}`);
  lines.push(`  Cleanup:  ${result.cleanupSnapshotId}`);

  if (result.candidates.length === 0) {
    lines.push("");
    lines.push("No leak candidates found (no class grew during action and remained after cleanup).");
  } else {
    lines.push("");
    lines.push(`Leak candidates (${result.candidates.length}):`);
    lines.push(
      `  ${"CLASS NAME".padEnd(30)} ${"TYPE".padEnd(10)} ${"BASELINE".padStart(12)}  ${"ACTION".padStart(12)}  ${"CLEANUP".padStart(12)}  PERSIST`,
    );
    for (const c of result.candidates) {
      lines.push(
        `  ${c.className.slice(0, 30).padEnd(30)} ${c.type.slice(0, 10).padEnd(10)} ${formatBytes(c.baselineRetained).padStart(12)}  ${formatBytes(c.actionRetained).padStart(12)}  ${formatBytes(c.cleanupRetained).padStart(12)}  ${c.persistenceScore.toFixed(2)}`,
      );
    }
  }

  if (result.caveats.length > 0) {
    lines.push("");
    lines.push("Caveats:");
    for (const c of result.caveats) lines.push(`  - ${c}`);
  }

  return lines.join("\n");
}

export function formatMemLeakCandidates(result: MemLeakCandidatesResult): string {
  const lines: string[] = [];
  lines.push(`Leak Candidates (heuristic) — snapshot ${result.snapshotId}:`);

  if (result.candidates.length === 0) {
    lines.push("  No suspicious classes detected.");
  } else {
    for (const c of result.candidates) {
      lines.push("");
      lines.push(`  ${c.classId} ${c.className} (${c.type})`);
      lines.push(`    Count: ${c.count.toLocaleString()}  Self: ${formatBytes(c.selfSize)}  Retained: ${formatBytes(c.retainedSize)}`);
      lines.push(`    Flags: ${c.suspicionFlags.join(", ")}`);
      for (const note of c.notes) {
        lines.push(`    - ${note}`);
      }
    }
  }

  if (result.caveats.length > 0) {
    lines.push("");
    lines.push("Caveats:");
    for (const c of result.caveats) lines.push(`  - ${c}`);
  }

  return lines.join("\n");
}
