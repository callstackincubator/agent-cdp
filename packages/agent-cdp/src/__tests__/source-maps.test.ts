import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveSourceMapsForCandidates } from "../source-maps.js";

const BUNDLE_URL = "http://localhost:8081/index.bundle?platform=ios&dev=true";
const SOURCE_MAP_URL = "http://localhost:8081/index.map?platform=ios&dev=true";

describe("source maps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls forward to the nearest mapped segment on the same line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url === BUNDLE_URL) {
          return new Response(`function demo() {}\n//# sourceMappingURL=${SOURCE_MAP_URL}`);
        }

        if (url === SOURCE_MAP_URL) {
          return new Response(JSON.stringify({
            version: 3,
            file: "index.bundle",
            sources: ["src/demo.ts"],
            names: [],
            mappings: ";EAAE",
          }));
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const result = await resolveSourceMapsForCandidates([
      { url: BUNDLE_URL, lineNumber: 1, columnNumber: 3 },
    ]);

    expect(result.getOriginalPosition(BUNDLE_URL, 1, 3)).toEqual({
      source: "src/demo.ts",
      line: 0,
      column: 2,
      name: null,
    });
    expect(result.symbolicatedCount).toBe(1);
  });
});
