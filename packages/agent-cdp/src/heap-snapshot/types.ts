// V8 heap snapshot raw JSON shape
export interface RawHeapSnapshotMeta {
  node_fields: string[];
  node_types: unknown[][];
  edge_fields: string[];
  edge_types: unknown[][];
  location_fields?: string[];
  sample_fields?: string[];
  trace_function_info_fields?: string[];
  trace_node_fields?: string[];
}

export interface RawHeapSnapshotJson {
  snapshot: {
    meta: RawHeapSnapshotMeta;
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
  locations?: number[];
  samples?: number[];
  trace_function_infos?: number[];
  trace_tree?: unknown[];
}

// Working representation after parsing
export interface NodeLocation {
  scriptId: number;
  line: number;
  column: number;
}

export interface ParsedSnapshot {
  // Raw data (kept as number[] for performance)
  nodes: number[];
  edges: number[];
  strings: string[];

  // Node field count
  nodeFieldCount: number;
  // Edge field count
  edgeFieldCount: number;

  // Node field indices
  nodeTypeIdx: number;
  nodeNameIdx: number;
  nodeIdIdx: number;
  nodeSelfSizeIdx: number;
  nodeEdgeCountIdx: number;
  nodeTraceNodeIdIdx: number;
  nodeDetachednessIdx: number;

  // Edge field indices
  edgeTypeIdx: number;
  edgeNameOrIndexIdx: number;
  edgeToNodeIdx: number;

  // Node type string table (first element of node_types)
  nodeTypeStrings: string[];
  // Edge type string table (first element of edge_types)
  edgeTypeStrings: string[];

  // Derived: edgeStartForNode[i] = cumulative edge offset (in edges array) for node at ordinal i
  edgeStartForNode: Uint32Array;

  // Map from V8 node ID to node ordinal
  nodeIdToIndex: Map<number, number>;

  // Optional location info keyed by node ordinal
  locations: Map<number, NodeLocation>;

  // Total node count
  nodeCount: number;
}

// Per-class aggregate
export interface ClassAggregate {
  classId: string;
  className: string;
  type: string;
  count: number;
  selfSize: number;
  retainedSize: number;
  maxRetainedSize: number;
  suspicionFlags: string[];
  nodeIndices: number[];
}

// Retainer edge for reverse traversal
export interface RetainerEdge {
  fromIndex: number;
  edgeType: string;
  edgeName: string;
}

// Full analyzed snapshot
export interface AnalyzedSnapshot {
  // Identity / provenance
  snapshotId: string;
  name: string;
  filePath: string;
  capturedAt: number;
  collectGarbageRequested: boolean;

  // Parsed snapshot
  parsed: ParsedSnapshot;

  // BFS distances from root (-1 = unreachable)
  distances: Int32Array;
  // BFS parent node index (-1 = root/no parent)
  bfsParents: Int32Array;
  // Retained sizes (approximate, BFS parent tree)
  retainedSizes: Float64Array;

  // Class aggregates
  classes: ClassAggregate[];
  classesById: Map<string, ClassAggregate>;
  classesByName: Map<string, ClassAggregate>;

  // Totals
  totals: {
    nodeCount: number;
    totalSelfSize: number;
    totalRetainedSize: number;
  };

  // Lazily populated reverse edges
  reverseEdges?: Map<number, RetainerEdge[]>;
}

// Serializable metadata for list views
export interface MemSnapshotMeta {
  snapshotId: string;
  name: string;
  filePath: string;
  capturedAt: number;
  collectGarbageRequested: boolean;
  nodeCount: number;
  totalSelfSize: number;
  totalRetainedSize: number;
}

// IPC result types

export interface MemSnapshotClassRow {
  classId: string;
  className: string;
  type: string;
  count: number;
  selfSize: number;
  retainedSize: number;
  selfPercent: number;
  retainedPercent: number;
  suspicionFlags: string[];
}

export interface MemSnapshotSummaryResult {
  snapshotId: string;
  name: string;
  capturedAt: number;
  nodeCount: number;
  totalSelfSize: number;
  totalRetainedSize: number;
  topByRetained: MemSnapshotClassRow[];
  topByCount: MemSnapshotClassRow[];
  suspiciousClasses: MemSnapshotClassRow[];
  caveats: string[];
}

export interface MemSnapshotClassesResult {
  snapshotId: string;
  total: number;
  offset: number;
  items: MemSnapshotClassRow[];
}

export interface MemSnapshotClassResult {
  snapshotId: string;
  aggregate: MemSnapshotClassRow;
  topInstances: Array<{
    nodeIndex: number;
    nodeId: number;
    name: string;
    type: string;
    selfSize: number;
    retainedSize: number;
    distance: number;
  }>;
  notes: string[];
}

export interface MemSnapshotInstanceRow {
  nodeIndex: number;
  nodeId: number;
  name: string;
  type: string;
  selfSize: number;
  retainedSize: number;
  distance: number;
}

export interface MemSnapshotInstancesResult {
  snapshotId: string;
  classId: string;
  total: number;
  offset: number;
  items: MemSnapshotInstanceRow[];
}

export interface MemSnapshotEdgeRow {
  edgeType: string;
  edgeName: string;
  targetNodeId: number;
  targetName: string;
  targetType: string;
  targetSelfSize: number;
}

export interface MemSnapshotInstanceResult {
  snapshotId: string;
  nodeIndex: number;
  nodeId: number;
  name: string;
  type: string;
  selfSize: number;
  retainedSize: number;
  distance: number;
  edgeCount: number;
  outEdges: MemSnapshotEdgeRow[];
}

export interface RetainerPathNode {
  nodeId: number;
  nodeIndex: number;
  name: string;
  type: string;
  edgeType: string;
  edgeName: string;
}

export interface MemSnapshotRetainersResult {
  snapshotId: string;
  nodeId: number;
  paths: RetainerPathNode[][];
}

export interface MemSnapshotDiffRow {
  className: string;
  type: string;
  baseCount: number;
  compareCount: number;
  countDelta: number;
  baseSelfSize: number;
  compareSelfSize: number;
  selfSizeDelta: number;
  baseRetainedSize: number;
  compareRetainedSize: number;
  retainedSizeDelta: number;
}

export interface MemSnapshotDiffResult {
  baseSnapshotId: string;
  compareSnapshotId: string;
  grew: MemSnapshotDiffRow[];
  shrank: MemSnapshotDiffRow[];
  appeared: MemSnapshotDiffRow[];
  disappeared: MemSnapshotDiffRow[];
  caveats: string[];
}

export interface MemLeakTripletEntry {
  className: string;
  type: string;
  baselineRetained: number;
  actionRetained: number;
  cleanupRetained: number;
  persistenceScore: number;
}

export interface MemLeakTripletResult {
  baselineSnapshotId: string;
  actionSnapshotId: string;
  cleanupSnapshotId: string;
  candidates: MemLeakTripletEntry[];
  caveats: string[];
}

export interface MemLeakCandidateEntry {
  classId: string;
  className: string;
  type: string;
  count: number;
  selfSize: number;
  retainedSize: number;
  suspicionFlags: string[];
  notes: string[];
}

export interface MemLeakCandidatesResult {
  snapshotId: string;
  candidates: MemLeakCandidateEntry[];
  caveats: string[];
}
