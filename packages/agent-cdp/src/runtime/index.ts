import type { RuntimeSession } from "../types.js";
import {
  DEFAULT_RUNTIME_OBJECT_GROUP,
  type RuntimeEvalResult,
  type RuntimePropertiesResult,
  type RuntimePropertyResult,
} from "./types.js";

interface RuntimeRemoteObject {
  type?: string;
  subtype?: string;
  className?: string;
  description?: string;
  value?: unknown;
  unserializableValue?: string;
  objectId?: string;
}

interface RuntimePropertyDescriptor {
  name?: string;
  enumerable?: boolean;
  writable?: boolean;
  value?: RuntimeRemoteObject;
  get?: RuntimeRemoteObject;
  set?: RuntimeRemoteObject;
}

interface RuntimeEvaluateResponse {
  result?: RuntimeRemoteObject;
  exceptionDetails?: {
    text?: string;
    exception?: RuntimeRemoteObject;
  };
}

interface RuntimeGetPropertiesResponse {
  result?: RuntimePropertyDescriptor[];
}

export class RuntimeManager {
  async evaluate(
    session: RuntimeSession,
    options: { expression: string; awaitPromise?: boolean; objectGroup?: string },
  ): Promise<RuntimeEvalResult> {
    const response = (await session.transport.send("Runtime.evaluate", {
      expression: options.expression,
      awaitPromise: options.awaitPromise === true,
      objectGroup: options.objectGroup || DEFAULT_RUNTIME_OBJECT_GROUP,
      generatePreview: true,
    })) as RuntimeEvaluateResponse;

    if (response.exceptionDetails) {
      throw new Error(formatException(response.exceptionDetails));
    }

    return normalizeRemoteObject(response.result || {}, options.objectGroup || DEFAULT_RUNTIME_OBJECT_GROUP);
  }

  async getProperties(
    session: RuntimeSession,
    options: { objectId: string; ownProperties?: boolean; accessorPropertiesOnly?: boolean },
  ): Promise<RuntimePropertiesResult> {
    const response = (await session.transport.send("Runtime.getProperties", {
      objectId: options.objectId,
      ownProperties: options.ownProperties === true,
      accessorPropertiesOnly: options.accessorPropertiesOnly === true,
      generatePreview: true,
    })) as RuntimeGetPropertiesResponse;

    return {
      objectId: options.objectId,
      properties: (response.result || []).map((property) => normalizeProperty(property)),
    };
  }

  async releaseObject(session: RuntimeSession, objectId: string): Promise<void> {
    await session.transport.send("Runtime.releaseObject", { objectId });
  }

  async releaseObjectGroup(session: RuntimeSession, objectGroup: string): Promise<void> {
    await session.transport.send("Runtime.releaseObjectGroup", { objectGroup });
  }
}

function normalizeRemoteObject(result: RuntimeRemoteObject, objectGroup?: string): RuntimeEvalResult {
  return {
    type: result.type || "undefined",
    subtype: result.subtype,
    className: result.className,
    description: result.description,
    value: result.value,
    unserializableValue: result.unserializableValue,
    objectId: result.objectId,
    objectGroup: result.objectId ? objectGroup : undefined,
  };
}

function normalizeProperty(property: RuntimePropertyDescriptor): RuntimePropertyResult {
  if (property.value) {
    return {
      name: property.name || "(unknown)",
      enumerable: property.enumerable !== false,
      writable: property.writable,
      isAccessor: false,
      ...normalizeRemoteObject(property.value),
    };
  }

  const accessor = property.get || property.set;
  return {
    name: property.name || "(unknown)",
    enumerable: property.enumerable !== false,
    writable: property.writable,
    isAccessor: true,
    ...normalizeRemoteObject(accessor || {}),
  };
}

function formatException(exception: NonNullable<RuntimeEvaluateResponse["exceptionDetails"]>): string {
  const description = exception.exception?.description || exception.text;
  return description ? `Runtime evaluation failed: ${description}` : "Runtime evaluation failed";
}

export type { RuntimeEvalResult, RuntimePropertiesResult, RuntimePropertyResult } from "./types.js";
export { DEFAULT_RUNTIME_OBJECT_GROUP } from "./types.js";
export { formatRuntimeEval, formatRuntimeEvalJson, formatRuntimeProperties } from "./formatters.js";
