import type { CdpProfile } from "./types.js";
import type { OriginalPosition, SymbolicationResult } from "../source-maps.js";
import { isHttpUrl, resolveSourceMapsForCandidates } from "../source-maps.js";

export type { OriginalPosition, SymbolicationResult } from "../source-maps.js";
export { isHttpUrl } from "../source-maps.js";

export async function resolveSourceMaps(profile: CdpProfile): Promise<SymbolicationResult> {
  return resolveSourceMapsForCandidates(
    profile.nodes.map((node) => ({
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      columnNumber: node.callFrame.columnNumber,
    })),
  );
}
