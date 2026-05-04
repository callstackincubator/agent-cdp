import type { AnalyzedSnapshot, ClassAggregate, ParsedSnapshot, RetainerEdge } from "./types.js";
import {
  edgeName,
  edgeToNodeIndex,
  edgeType,
  isDetached,
  nodeName,
  nodeSelfSize,
  nodeType,
} from "./parser.js";

function constructorName(snap: ParsedSnapshot, i: number): string | null {
  const type = nodeType(snap, i);
  switch (type) {
    case "object":
    case "closure":
    case "regexp":
    case "number":
    case "bigint":
    case "symbol":
      return nodeName(snap, i) || `(${type})`;
    case "string":
    case "concatenated string":
    case "sliced string":
      return "(string)";
    case "array":
      return "(array)";
    case "code":
      return "(compiled code)";
    case "hidden":
    case "synthetic":
      // Skip system internals
      return null;
    default:
      return `(${type})`;
  }
}

export function analyzeSnapshot(
  parsed: ParsedSnapshot,
  meta: {
    snapshotId: string;
    name: string;
    filePath: string;
    capturedAt: number;
    collectGarbageRequested: boolean;
  },
): AnalyzedSnapshot {
  const nodeCount = parsed.nodeCount;

  // Step 1: BFS from root (index 0) to compute distances and parents
  const distances = new Int32Array(nodeCount).fill(-1);
  const bfsParents = new Int32Array(nodeCount).fill(-1);
  const bfsOrder: number[] = [];

  if (nodeCount > 0) {
    distances[0] = 0;
    const queue: number[] = [0];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      bfsOrder.push(current);

      const edgeStart = parsed.edgeStartForNode[current];
      const edgeEnd = parsed.edgeStartForNode[current + 1];

      for (let edgeOffset = edgeStart; edgeOffset < edgeEnd; edgeOffset += parsed.edgeFieldCount) {
        const childIndex = edgeToNodeIndex(parsed, edgeOffset);
        if (childIndex < nodeCount && distances[childIndex] === -1) {
          distances[childIndex] = distances[current] + 1;
          bfsParents[childIndex] = current;
          queue.push(childIndex);
        }
      }
    }
  }

  // Step 2: Retained sizes via BFS parent tree (approximate)
  const retainedSizes = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    retainedSizes[i] = nodeSelfSize(parsed, i);
  }

  // Process in reverse BFS order — children before parents
  for (let k = bfsOrder.length - 1; k >= 0; k--) {
    const i = bfsOrder[k];
    const parent = bfsParents[i];
    if (parent >= 0) {
      retainedSizes[parent] += retainedSizes[i];
    }
  }

  // Step 3: Class aggregates
  const classByName = new Map<string, {
    className: string;
    type: string;
    count: number;
    selfSize: number;
    retainedSize: number;
    maxRetainedSize: number;
    nodeIndices: number[];
    hasDetached: boolean;
  }>();

  for (let i = 0; i < nodeCount; i++) {
    const className = constructorName(parsed, i);
    if (className === null) continue;

    const type = nodeType(parsed, i);
    const self = nodeSelfSize(parsed, i);
    const retained = retainedSizes[i];
    const detached = isDetached(parsed, i);

    const key = `${className}|${type}`;
    let agg = classByName.get(key);
    if (!agg) {
      agg = {
        className,
        type,
        count: 0,
        selfSize: 0,
        retainedSize: 0,
        maxRetainedSize: 0,
        nodeIndices: [],
        hasDetached: false,
      };
      classByName.set(key, agg);
    }
    agg.count++;
    agg.selfSize += self;
    agg.retainedSize += retained;
    if (retained > agg.maxRetainedSize) agg.maxRetainedSize = retained;
    agg.nodeIndices.push(i);
    if (detached) agg.hasDetached = true;
  }

  // Step 4: Build suspicion flags and sort classes by retainedSize desc
  const ONE_MB = 1024 * 1024;

  const rawClasses = [...classByName.values()].sort((a, b) => b.retainedSize - a.retainedSize);

  const classes: ClassAggregate[] = rawClasses.map((agg, idx) => {
    const suspicionFlags: string[] = [];

    if (agg.hasDetached) {
      suspicionFlags.push("detached");
    }
    if (/EventListener|Observer|MutationObserver|ResizeObserver/i.test(agg.className)) {
      suspicionFlags.push("eventListener");
    }
    if (/Timer|Interval|Timeout|setInterval|setTimeout/i.test(agg.className)) {
      suspicionFlags.push("timerRef");
    }
    if (agg.type === "closure" && agg.retainedSize > ONE_MB) {
      suspicionFlags.push("closureGrowth");
    }
    if (
      (agg.className === "Map" || agg.className === "Set" ||
        agg.className === "WeakMap" || agg.className === "WeakSet") &&
      agg.count > 1000
    ) {
      suspicionFlags.push("mapSetGrowth");
    }
    if (agg.className === "Promise" && agg.count > 500) {
      suspicionFlags.push("promiseRetention");
    }

    return {
      classId: `c${idx + 1}`,
      className: agg.className,
      type: agg.type,
      count: agg.count,
      selfSize: agg.selfSize,
      retainedSize: agg.retainedSize,
      maxRetainedSize: agg.maxRetainedSize,
      suspicionFlags,
      nodeIndices: agg.nodeIndices,
    };
  });

  // Step 6: Build lookup maps
  const classesById = new Map<string, ClassAggregate>();
  const classesByName = new Map<string, ClassAggregate>();
  for (const cls of classes) {
    classesById.set(cls.classId, cls);
    classesByName.set(`${cls.className}|${cls.type}`, cls);
  }

  // Step 7: Compute totals
  let totalSelfSize = 0;
  for (let i = 0; i < nodeCount; i++) {
    const type = nodeType(parsed, i);
    if (type === "hidden" || type === "synthetic") continue;
    totalSelfSize += nodeSelfSize(parsed, i);
  }

  // totalRetainedSize = sum of retainedSizes of root's direct children
  let totalRetainedSize = 0;
  if (nodeCount > 0) {
    const edgeStart = parsed.edgeStartForNode[0];
    const edgeEnd = parsed.edgeStartForNode[1];
    const seenChildren = new Set<number>();
    for (let edgeOffset = edgeStart; edgeOffset < edgeEnd; edgeOffset += parsed.edgeFieldCount) {
      const childIndex = edgeToNodeIndex(parsed, edgeOffset);
      if (childIndex < nodeCount && !seenChildren.has(childIndex)) {
        seenChildren.add(childIndex);
        totalRetainedSize += retainedSizes[childIndex];
      }
    }
  }

  return {
    snapshotId: meta.snapshotId,
    name: meta.name,
    filePath: meta.filePath,
    capturedAt: meta.capturedAt,
    collectGarbageRequested: meta.collectGarbageRequested,
    parsed,
    distances,
    bfsParents,
    retainedSizes,
    classes,
    classesById,
    classesByName,
    totals: {
      nodeCount,
      totalSelfSize,
      totalRetainedSize,
    },
  };
}

export function buildReverseEdges(snap: AnalyzedSnapshot): void {
  if (snap.reverseEdges !== undefined) return;

  const parsed = snap.parsed;
  const reverseEdges = new Map<number, RetainerEdge[]>();

  for (let fromIndex = 0; fromIndex < parsed.nodeCount; fromIndex++) {
    const edgeStart = parsed.edgeStartForNode[fromIndex];
    const edgeEnd = parsed.edgeStartForNode[fromIndex + 1];

    for (let edgeOffset = edgeStart; edgeOffset < edgeEnd; edgeOffset += parsed.edgeFieldCount) {
      const toIndex = edgeToNodeIndex(parsed, edgeOffset);
      if (toIndex >= parsed.nodeCount) continue;

      const et = edgeType(parsed, edgeOffset);
      const en = edgeName(parsed, edgeOffset);

      let list = reverseEdges.get(toIndex);
      if (!list) {
        list = [];
        reverseEdges.set(toIndex, list);
      }
      list.push({ fromIndex, edgeType: et, edgeName: en });
    }
  }

  (snap as { reverseEdges: Map<number, RetainerEdge[]> }).reverseEdges = reverseEdges;
}
