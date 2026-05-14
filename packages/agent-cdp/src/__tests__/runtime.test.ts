import { describe, expect, it } from "vitest";
import { formatRuntimeEval, formatRuntimeEvalJson, formatRuntimeProperties } from "../runtime/formatters.js";
import { RuntimeManager } from "../runtime/index.js";

describe("runtime formatters", () => {
  it("formats primitive eval results", () => {
    expect(
      formatRuntimeEval({
        type: "number",
        value: 42,
      }),
    ).toBe("number: 42");
  });

  it("formats string eval results as json-safe text", () => {
    expect(
      formatRuntimeEval({
        type: "string",
        value: "hello",
      }),
    ).toBe('string: "hello"');
    expect(
      formatRuntimeEvalJson({
        type: "string",
        value: "hello",
      }),
    ).toBe('"hello"');
  });

  it("formats remote object eval results with object ids", () => {
    expect(
      formatRuntimeEval({
        type: "object",
        subtype: "array",
        description: "Array(3)",
        objectId: "obj-1",
        objectGroup: "agent-cdp-runtime",
      }),
    ).toBe("array Array(3)\nobjectId: obj-1");
  });

  it("formats property listings with nested object handles", () => {
    expect(
      formatRuntimeProperties({
        objectId: "root-1",
        properties: [
          {
            name: "count",
            enumerable: true,
            isAccessor: false,
            type: "number",
            value: 2,
          },
          {
            name: "items",
            enumerable: true,
            isAccessor: false,
            type: "object",
            subtype: "array",
            description: "Array(2)",
            objectId: "child-1",
          },
        ],
      }),
    ).toBe("count = number: 2\nitems = array Array(2) (objectId: child-1)");
  });
});

describe("runtime manager", () => {
  it("releases a runtime object", async () => {
    const sent: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const manager = new RuntimeManager();
    const session = {
      transport: {
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        send: async (method: string, params?: Record<string, unknown>) => {
          sent.push({ method, params });
          return {};
        },
        onEvent: () => () => {},
      },
    };

    await manager.releaseObject(session as never, "obj-9");

    expect(sent).toEqual([{ method: "Runtime.releaseObject", params: { objectId: "obj-9" } }]);
  });
});
