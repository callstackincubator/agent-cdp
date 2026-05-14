import type { AgentRuntimeCommand } from "./index.js";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type RuntimeCommandType = AgentRuntimeCommand["type"];

type _AllowsOnlyMeasurementCommands = Assert<
  Equals<
    RuntimeCommandType,
    | "js-allocation-start"
    | "js-allocation-status"
    | "js-allocation-stop"
    | "js-allocation-timeline-start"
    | "js-allocation-timeline-status"
    | "js-allocation-timeline-stop"
    | "js-memory-sample"
    | "js-profile-start"
    | "js-profile-status"
    | "js-profile-stop"
    | "mem-snapshot-capture"
    | "network-start"
    | "network-status"
    | "network-stop"
    | "start-trace"
    | "stop-trace"
    | "trace-status"
  >
>;
