import { buildReverseEdges } from "./analyze.js";
import {
  edgeName,
  edgeToNodeIndex,
  edgeType,
  nodeId,
  nodeName,
  nodeSelfSize,
  nodeType,
} from "./parser.js";
import type {
  AnalyzedSnapshot,
  ClassAggregate,
  MemLeakCandidatesResult,
  MemLeakTripletResult,
  MemSnapshotClassResult,
  MemSnapshotClassesResult,
  MemSnapshotClassRow,
  MemSnapshotDiffResult,
  MemSnapshotDiffRow,
  MemSnapshotInstanceResult,
  MemSnapshotInstanceRow,
  MemSnapshotInstancesResult,
  MemSnapshotMeta,
  MemSnapshotRetainersResult,
  MemSnapshotSummaryResult,
  RetainerPathNode,
} from "./types.js";

const RETAINED_CAVEATS = [
  "Retained size is approximate (BFS parent tree, not dominator tree)",
  "JS heap only, not full process RAM",
];

function toRow(cls: ClassAggregate, snap: AnalyzedSnapshot): MemSnapshotClassRow {
  const totalSelf = snap.totals.totalSelfSize || 1;
  const totalRetained = snap.totals.totalRetainedSize || 1;
  return {
    classId: cls.classId,
    className: cls.className,
    type: cls.type,
    count: cls.count,
    selfSize: cls.selfSize,
    retainedSize: cls.retainedSize,
    selfPercent: Math.round((cls.selfSize / totalSelf) * 10000) / 100,
    retainedPercent: Math.round((cls.retainedSize / totalRetained) * 10000) / 100,
    suspicionFlags: cls.suspicionFlags,
  };
}

export function querySnapshotMeta(snap: AnalyzedSnapshot): MemSnapshotMeta {
  return {
    snapshotId: snap.snapshotId,
    name: snap.name,
    filePath: snap.filePath,
    capturedAt: snap.capturedAt,
    collectGarbageRequested: snap.collectGarbageRequested,
    nodeCount: snap.totals.nodeCount,
    totalSelfSize: snap.totals.totalSelfSize,
    totalRetainedSize: snap.totals.totalRetainedSize,
  };
}

export function querySnapshotSummary(snap: AnalyzedSnapshot): MemSnapshotSummaryResult {
  const topByRetained = snap.classes.slice(0, 10).map((cls) => toRow(cls, snap));

  const topByCount = [...snap.classes]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((cls) => toRow(cls, snap));

  const suspiciousClasses = snap.classes
    .filter((cls) => cls.suspicionFlags.length > 0)
    .map((cls) => toRow(cls, snap));

  return {
    snapshotId: snap.snapshotId,
    name: snap.name,
    capturedAt: snap.capturedAt,
    nodeCount: snap.totals.nodeCount,
    totalSelfSize: snap.totals.totalSelfSize,
    totalRetainedSize: snap.totals.totalRetainedSize,
    topByRetained,
    topByCount,
    suspiciousClasses,
    caveats: RETAINED_CAVEATS,
  };
}

export interface ClassesOptions {
  sortBy?: "retainedSize" | "selfSize" | "count";
  limit?: number;
  offset?: number;
  filter?: string;
}

export function queryClasses(snap: AnalyzedSnapshot, opts: ClassesOptions = {}): MemSnapshotClassesResult {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const sortBy = opts.sortBy ?? "retainedSize";
  const filter = opts.filter?.toLowerCase();

  let classes = [...snap.classes];

  if (filter) {
    classes = classes.filter((cls) => cls.className.toLowerCase().includes(filter));
  }

  if (sortBy === "selfSize") {
    classes.sort((a, b) => b.selfSize - a.selfSize);
  } else if (sortBy === "count") {
    classes.sort((a, b) => b.count - a.count);
  }
  // default: already sorted by retainedSize desc

  const total = classes.length;
  const items = classes.slice(offset, offset + limit).map((cls) => toRow(cls, snap));

  return {
    snapshotId: snap.snapshotId,
    total,
    offset,
    items,
  };
}

export function queryClass(snap: AnalyzedSnapshot, classId: string): MemSnapshotClassResult {
  const cls = snap.classesById.get(classId);
  if (!cls) throw new Error(`Class ${classId} not found in snapshot ${snap.snapshotId}`);

  const topInstances = [...cls.nodeIndices]
    .sort((a, b) => snap.retainedSizes[b] - snap.retainedSizes[a])
    .slice(0, 10)
    .map((ni) => ({
      nodeIndex: ni,
      nodeId: nodeId(snap.parsed, ni),
      name: nodeName(snap.parsed, ni),
      type: nodeType(snap.parsed, ni),
      selfSize: nodeSelfSize(snap.parsed, ni),
      retainedSize: snap.retainedSizes[ni],
      distance: snap.distances[ni],
    }));

  const notes: string[] = [];
  if (cls.suspicionFlags.includes("detached")) {
    notes.push("Some instances are detached from the DOM tree and may indicate a leak.");
  }
  if (cls.suspicionFlags.includes("eventListener")) {
    notes.push("This class name resembles an event listener or observer — check for unremoved listeners.");
  }
  if (cls.suspicionFlags.includes("timerRef")) {
    notes.push("This class name resembles a timer/interval reference — check for uncleared timers.");
  }
  if (cls.suspicionFlags.includes("closureGrowth")) {
    notes.push("Closure retained size exceeds 1 MB — closures may be capturing large scope chains.");
  }
  if (cls.suspicionFlags.includes("mapSetGrowth")) {
    notes.push("High instance count for a Map/Set type — check for unbounded growth.");
  }
  if (cls.suspicionFlags.includes("promiseRetention")) {
    notes.push("High Promise count — check for unresolved or chained promises accumulating.");
  }

  return {
    snapshotId: snap.snapshotId,
    aggregate: toRow(cls, snap),
    topInstances,
    notes,
  };
}

export interface InstancesOptions {
  limit?: number;
  offset?: number;
  sortBy?: "retainedSize" | "selfSize";
}

export function queryInstances(
  snap: AnalyzedSnapshot,
  classId: string,
  opts: InstancesOptions = {},
): MemSnapshotInstancesResult {
  const cls = snap.classesById.get(classId);
  if (!cls) throw new Error(`Class ${classId} not found in snapshot ${snap.snapshotId}`);

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const sortBy = opts.sortBy ?? "retainedSize";

  const sorted = [...cls.nodeIndices].sort((a, b) =>
    sortBy === "selfSize"
      ? nodeSelfSize(snap.parsed, b) - nodeSelfSize(snap.parsed, a)
      : snap.retainedSizes[b] - snap.retainedSizes[a],
  );

  const total = sorted.length;
  const items: MemSnapshotInstanceRow[] = sorted.slice(offset, offset + limit).map((ni) => ({
    nodeIndex: ni,
    nodeId: nodeId(snap.parsed, ni),
    name: nodeName(snap.parsed, ni),
    type: nodeType(snap.parsed, ni),
    selfSize: nodeSelfSize(snap.parsed, ni),
    retainedSize: snap.retainedSizes[ni],
    distance: snap.distances[ni],
  }));

  return {
    snapshotId: snap.snapshotId,
    classId,
    total,
    offset,
    items,
  };
}

export function queryInstance(snap: AnalyzedSnapshot, targetNodeId: number): MemSnapshotInstanceResult {
  const ni = snap.parsed.nodeIdToIndex.get(targetNodeId);
  if (ni === undefined) throw new Error(`Node ID ${targetNodeId} not found in snapshot ${snap.snapshotId}`);

  const edgeStart = snap.parsed.edgeStartForNode[ni];
  const edgeEnd = snap.parsed.edgeStartForNode[ni + 1];
  const edgeCount = (edgeEnd - edgeStart) / snap.parsed.edgeFieldCount;

  const outEdges = [];
  let edgeIdx = 0;
  for (let edgeOffset = edgeStart; edgeOffset < edgeEnd && edgeIdx < 10; edgeOffset += snap.parsed.edgeFieldCount) {
    const toIndex = edgeToNodeIndex(snap.parsed, edgeOffset);
    outEdges.push({
      edgeType: edgeType(snap.parsed, edgeOffset),
      edgeName: edgeName(snap.parsed, edgeOffset),
      targetNodeId: nodeId(snap.parsed, toIndex),
      targetName: nodeName(snap.parsed, toIndex),
      targetType: nodeType(snap.parsed, toIndex),
      targetSelfSize: nodeSelfSize(snap.parsed, toIndex),
    });
    edgeIdx++;
  }

  return {
    snapshotId: snap.snapshotId,
    nodeIndex: ni,
    nodeId: targetNodeId,
    name: nodeName(snap.parsed, ni),
    type: nodeType(snap.parsed, ni),
    selfSize: nodeSelfSize(snap.parsed, ni),
    retainedSize: snap.retainedSizes[ni],
    distance: snap.distances[ni],
    edgeCount,
    outEdges,
  };
}

export function queryRetainers(
  snap: AnalyzedSnapshot,
  targetNodeId: number,
  depth = 5,
  limit = 5,
): MemSnapshotRetainersResult {
  buildReverseEdges(snap);
  const reverseEdges = snap.reverseEdges!;

  const targetIndex = snap.parsed.nodeIdToIndex.get(targetNodeId);
  if (targetIndex === undefined) {
    throw new Error(`Node ID ${targetNodeId} not found in snapshot ${snap.snapshotId}`);
  }

  // BFS backwards, collecting paths
  interface PathState {
    nodeIndex: number;
    path: RetainerPathNode[];
  }

  const paths: RetainerPathNode[][] = [];
  const queue: PathState[] = [
    {
      nodeIndex: targetIndex,
      path: [],
    },
  ];
  let head = 0;

  while (head < queue.length && paths.length < limit) {
    const { nodeIndex, path } = queue[head++];

    if (path.length >= depth) {
      paths.push(path);
      continue;
    }

    const retainers = reverseEdges.get(nodeIndex);
    if (!retainers || retainers.length === 0) {
      if (path.length > 0) paths.push(path);
      continue;
    }

    for (const retainer of retainers.slice(0, limit)) {
      const fromName = nodeName(snap.parsed, retainer.fromIndex);
      const fromType = nodeType(snap.parsed, retainer.fromIndex);
      const fromId = nodeId(snap.parsed, retainer.fromIndex);

      const newNode: RetainerPathNode = {
        nodeId: fromId,
        nodeIndex: retainer.fromIndex,
        name: fromName,
        type: fromType,
        edgeType: retainer.edgeType,
        edgeName: retainer.edgeName,
      };

      queue.push({
        nodeIndex: retainer.fromIndex,
        path: [...path, newNode],
      });
    }
  }

  // Drain remaining short paths
  while (head < queue.length) {
    const { path } = queue[head++];
    if (path.length > 0 && paths.length < limit) {
      paths.push(path);
    }
  }

  return {
    snapshotId: snap.snapshotId,
    nodeId: targetNodeId,
    paths: paths.slice(0, limit),
  };
}

export interface DiffOptions {
  sortBy?: "retainedDelta" | "selfDelta" | "countDelta";
  limit?: number;
  offset?: number;
}

export function queryDiff(
  base: AnalyzedSnapshot,
  compare: AnalyzedSnapshot,
  opts: DiffOptions = {},
): MemSnapshotDiffResult {
  const sortBy = opts.sortBy ?? "retainedDelta";
  const limit = opts.limit ?? 20;

  // Build lookup map for base classes by (className|type)
  const baseByKey = new Map<string, ClassAggregate>();
  for (const cls of base.classes) {
    baseByKey.set(`${cls.className}|${cls.type}`, cls);
  }
  const compareByKey = new Map<string, ClassAggregate>();
  for (const cls of compare.classes) {
    compareByKey.set(`${cls.className}|${cls.type}`, cls);
  }

  const allKeys = new Set<string>();
  for (const cls of base.classes) allKeys.add(`${cls.className}|${cls.type}`);
  for (const cls of compare.classes) allKeys.add(`${cls.className}|${cls.type}`);

  const rows: MemSnapshotDiffRow[] = [];

  for (const key of allKeys) {
    const b = baseByKey.get(key);
    const c = compareByKey.get(key);

    const className = (b ?? c)!.className;
    const type = (b ?? c)!.type;

    rows.push({
      className,
      type,
      baseCount: b?.count ?? 0,
      compareCount: c?.count ?? 0,
      countDelta: (c?.count ?? 0) - (b?.count ?? 0),
      baseSelfSize: b?.selfSize ?? 0,
      compareSelfSize: c?.selfSize ?? 0,
      selfSizeDelta: (c?.selfSize ?? 0) - (b?.selfSize ?? 0),
      baseRetainedSize: b?.retainedSize ?? 0,
      compareRetainedSize: c?.retainedSize ?? 0,
      retainedSizeDelta: (c?.retainedSize ?? 0) - (b?.retainedSize ?? 0),
    });
  }

  const compareKey = sortBy === "selfDelta"
    ? (a: MemSnapshotDiffRow, b: MemSnapshotDiffRow) => Math.abs(b.selfSizeDelta) - Math.abs(a.selfSizeDelta)
    : sortBy === "countDelta"
    ? (a: MemSnapshotDiffRow, b: MemSnapshotDiffRow) => Math.abs(b.countDelta) - Math.abs(a.countDelta)
    : (a: MemSnapshotDiffRow, b: MemSnapshotDiffRow) => Math.abs(b.retainedSizeDelta) - Math.abs(a.retainedSizeDelta);

  const grew = rows
    .filter((r) => r.baseCount > 0 && r.compareCount > 0 && r.retainedSizeDelta > 0)
    .sort(compareKey)
    .slice(0, limit);

  const shrank = rows
    .filter((r) => r.baseCount > 0 && r.compareCount > 0 && r.retainedSizeDelta < 0)
    .sort(compareKey)
    .slice(0, limit);

  const appeared = rows
    .filter((r) => r.baseCount === 0 && r.compareCount > 0)
    .sort((a, b) => b.compareRetainedSize - a.compareRetainedSize)
    .slice(0, limit);

  const disappeared = rows
    .filter((r) => r.baseCount > 0 && r.compareCount === 0)
    .sort((a, b) => b.baseRetainedSize - a.baseRetainedSize)
    .slice(0, limit);

  return {
    baseSnapshotId: base.snapshotId,
    compareSnapshotId: compare.snapshotId,
    grew,
    shrank,
    appeared,
    disappeared,
    caveats: [
      ...RETAINED_CAVEATS,
      "Class matching is by (className, type) — renamed or minified classes may not align",
    ],
  };
}

export function queryLeakTriplet(
  baseline: AnalyzedSnapshot,
  action: AnalyzedSnapshot,
  cleanup: AnalyzedSnapshot,
  limit = 10,
): MemLeakTripletResult {
  const baseByKey = new Map<string, ClassAggregate>();
  for (const cls of baseline.classes) {
    baseByKey.set(`${cls.className}|${cls.type}`, cls);
  }

  const cleanupByKey = new Map<string, ClassAggregate>();
  for (const cls of cleanup.classes) {
    cleanupByKey.set(`${cls.className}|${cls.type}`, cls);
  }

  const candidates = [];

  for (const actionCls of action.classes) {
    const key = `${actionCls.className}|${actionCls.type}`;
    const baseCls = baseByKey.get(key);
    const cleanupCls = cleanupByKey.get(key);

    const baselineRetained = baseCls?.retainedSize ?? 0;
    const actionRetained = actionCls.retainedSize;
    const cleanupRetained = cleanupCls?.retainedSize ?? 0;

    const growthFromBaseline = actionRetained - baselineRetained;
    if (growthFromBaseline <= 0) continue;

    // Persistent if cleanup retained > 50% of action retained
    const persistent = actionRetained > 0 && cleanupRetained > 0.5 * actionRetained;
    if (!persistent) continue;

    const persistenceScore =
      actionRetained > 0 ? Math.round((cleanupRetained / actionRetained) * 100) / 100 : 0;

    candidates.push({
      className: actionCls.className,
      type: actionCls.type,
      baselineRetained,
      actionRetained,
      cleanupRetained,
      persistenceScore,
    });
  }

  candidates.sort((a, b) => b.cleanupRetained - a.cleanupRetained);

  return {
    baselineSnapshotId: baseline.snapshotId,
    actionSnapshotId: action.snapshotId,
    cleanupSnapshotId: cleanup.snapshotId,
    candidates: candidates.slice(0, limit),
    caveats: [
      ...RETAINED_CAVEATS,
      "Triplet analysis requires snapshots taken at baseline, peak, and after GC/cleanup",
      "Persistence score = cleanupRetained / actionRetained (1.0 = fully retained)",
    ],
  };
}

export function queryLeakCandidates(snap: AnalyzedSnapshot, limit = 20): MemLeakCandidatesResult {
  const suspicious = snap.classes
    .filter((cls) => cls.suspicionFlags.length > 0)
    .slice(0, limit);

  const candidates = suspicious.map((cls) => {
    const notes: string[] = [];
    if (cls.suspicionFlags.includes("detached")) {
      notes.push("Detached DOM nodes may indicate a leak.");
    }
    if (cls.suspicionFlags.includes("eventListener")) {
      notes.push("Unremoved event listeners or observers can prevent GC.");
    }
    if (cls.suspicionFlags.includes("timerRef")) {
      notes.push("Uncleared timers or intervals hold references.");
    }
    if (cls.suspicionFlags.includes("closureGrowth")) {
      notes.push("Large closure retained size — check captured scope.");
    }
    if (cls.suspicionFlags.includes("mapSetGrowth")) {
      notes.push("Unbounded Map/Set growth detected.");
    }
    if (cls.suspicionFlags.includes("promiseRetention")) {
      notes.push("High Promise accumulation — check for unresolved chains.");
    }

    return {
      classId: cls.classId,
      className: cls.className,
      type: cls.type,
      count: cls.count,
      selfSize: cls.selfSize,
      retainedSize: cls.retainedSize,
      suspicionFlags: cls.suspicionFlags,
      notes,
    };
  });

  return {
    snapshotId: snap.snapshotId,
    candidates,
    caveats: [
      ...RETAINED_CAVEATS,
      "Single-snapshot heuristics only — use triplet mode for confirmation",
    ],
  };
}
