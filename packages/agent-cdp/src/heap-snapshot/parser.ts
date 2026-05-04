import type { NodeLocation, ParsedSnapshot, RawHeapSnapshotJson } from "./types.js";

export function parseHeapSnapshot(raw: RawHeapSnapshotJson): ParsedSnapshot {
  const meta = raw.snapshot.meta;

  // Node field indices
  const nodeFields = meta.node_fields;
  const nodeTypeIdx = nodeFields.indexOf("type");
  const nodeNameIdx = nodeFields.indexOf("name");
  const nodeIdIdx = nodeFields.indexOf("id");
  const nodeSelfSizeIdx = nodeFields.indexOf("self_size");
  const nodeEdgeCountIdx = nodeFields.indexOf("edge_count");
  const nodeTraceNodeIdIdx = nodeFields.indexOf("trace_node_id");
  const nodeDetachednessIdx = nodeFields.indexOf("detachedness");

  // Edge field indices
  const edgeFields = meta.edge_fields;
  const edgeTypeIdx = edgeFields.indexOf("type");
  const edgeNameOrIndexIdx = edgeFields.indexOf("name_or_index");
  const edgeToNodeIdx = edgeFields.indexOf("to_node");

  const nodeFieldCount = nodeFields.length;
  const edgeFieldCount = edgeFields.length;

  // Node/edge type string tables
  const nodeTypeStrings = (meta.node_types[0] as string[]) ?? [];
  const edgeTypeStrings = (meta.edge_types[0] as string[]) ?? [];

  const nodes = raw.nodes;
  const edges = raw.edges;
  const strings = raw.strings;
  const nodeCount = nodes.length / nodeFieldCount;

  // Build edgeStartForNode: cumulative edge count (in edges array entries, not bytes)
  const edgeStartForNode = new Uint32Array(nodeCount + 1);
  let edgeCursor = 0;
  for (let i = 0; i < nodeCount; i++) {
    edgeStartForNode[i] = edgeCursor;
    const edgeCount = nodes[i * nodeFieldCount + nodeEdgeCountIdx];
    edgeCursor += edgeCount * edgeFieldCount;
  }
  edgeStartForNode[nodeCount] = edgeCursor;

  // Build nodeIdToIndex map
  const nodeIdToIndex = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = nodes[i * nodeFieldCount + nodeIdIdx];
    nodeIdToIndex.set(nodeId, i);
  }

  // Parse locations: format is [nodeOrdinal, scriptId, line, column, ...]
  const locations = new Map<number, NodeLocation>();
  if (raw.locations && raw.locations.length >= 4) {
    const locData = raw.locations;
    for (let i = 0; i + 3 < locData.length; i += 4) {
      const nodeOrdinal = locData[i];
      const scriptId = locData[i + 1];
      const line = locData[i + 2];
      const column = locData[i + 3];
      locations.set(nodeOrdinal, { scriptId, line, column });
    }
  }

  return {
    nodes,
    edges,
    strings,
    nodeFieldCount,
    edgeFieldCount,
    nodeTypeIdx,
    nodeNameIdx,
    nodeIdIdx,
    nodeSelfSizeIdx,
    nodeEdgeCountIdx,
    nodeTraceNodeIdIdx,
    nodeDetachednessIdx,
    edgeTypeIdx,
    edgeNameOrIndexIdx,
    edgeToNodeIdx,
    nodeTypeStrings,
    edgeTypeStrings,
    edgeStartForNode,
    nodeIdToIndex,
    locations,
    nodeCount,
  };
}

// Node accessors

export function nodeType(snap: ParsedSnapshot, i: number): string {
  const typeIndex = snap.nodes[i * snap.nodeFieldCount + snap.nodeTypeIdx];
  return snap.nodeTypeStrings[typeIndex] ?? "unknown";
}

export function nodeName(snap: ParsedSnapshot, i: number): string {
  const nameIndex = snap.nodes[i * snap.nodeFieldCount + snap.nodeNameIdx];
  return snap.strings[nameIndex] ?? "";
}

export function nodeId(snap: ParsedSnapshot, i: number): number {
  return snap.nodes[i * snap.nodeFieldCount + snap.nodeIdIdx];
}

export function nodeSelfSize(snap: ParsedSnapshot, i: number): number {
  return snap.nodes[i * snap.nodeFieldCount + snap.nodeSelfSizeIdx];
}

export function nodeEdgeCount(snap: ParsedSnapshot, i: number): number {
  return snap.nodes[i * snap.nodeFieldCount + snap.nodeEdgeCountIdx];
}

export function isDetached(snap: ParsedSnapshot, i: number): boolean {
  if (snap.nodeDetachednessIdx < 0) return false;
  return snap.nodes[i * snap.nodeFieldCount + snap.nodeDetachednessIdx] === 1;
}

// Edge accessors — edgeOffset is the byte offset into snap.edges (multiple of edgeFieldCount)

export function edgeType(snap: ParsedSnapshot, edgeOffset: number): string {
  const typeIndex = snap.edges[edgeOffset + snap.edgeTypeIdx];
  return snap.edgeTypeStrings[typeIndex] ?? "unknown";
}

export function edgeName(snap: ParsedSnapshot, edgeOffset: number): string {
  const et = edgeType(snap, edgeOffset);
  const nameOrIndex = snap.edges[edgeOffset + snap.edgeNameOrIndexIdx];
  // "element" edges: name_or_index is a numeric array index
  if (et === "element") {
    return `[${nameOrIndex}]`;
  }
  return snap.strings[nameOrIndex] ?? String(nameOrIndex);
}

export function edgeToNodeIndex(snap: ParsedSnapshot, edgeOffset: number): number {
  // to_node stores targetNodeOrdinal * nodeFieldCount (element offset, not byte offset)
  const toNode = snap.edges[edgeOffset + snap.edgeToNodeIdx];
  return toNode / snap.nodeFieldCount;
}
