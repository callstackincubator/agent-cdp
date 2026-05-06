import type { RuntimeEvalResult, RuntimePropertiesResult, RuntimePropertyResult } from "./types.js";

export function formatRuntimeEval(result: RuntimeEvalResult, verbose = false): string {
  const summary = summarizeRemoteValue(result);
  if (!verbose) {
    if (result.objectId) {
      return `${summary}\nobjectId: ${result.objectId}`;
    }
    return summary;
  }

  const lines = [summary];
  if (result.className) lines.push(`className: ${result.className}`);
  if (result.description && result.description !== summary) lines.push(`description: ${result.description}`);
  if (result.objectId) lines.push(`objectId: ${result.objectId}`);
  if (result.objectGroup) lines.push(`objectGroup: ${result.objectGroup}`);
  return lines.join("\n");
}

export function formatRuntimeEvalJson(result: RuntimeEvalResult): string {
  if (!result.objectId) {
    if (result.unserializableValue) {
      return result.unserializableValue;
    }
    return JSON.stringify(result.value, null, 2) ?? "undefined";
  }

  return JSON.stringify(
    {
      type: result.type,
      subtype: result.subtype,
      className: result.className,
      description: result.description,
      objectId: result.objectId,
      objectGroup: result.objectGroup,
    },
    null,
    2,
  );
}

export function formatRuntimeProperties(result: RuntimePropertiesResult, verbose = false): string {
  if (result.properties.length === 0) {
    return `No properties for ${result.objectId}`;
  }

  const lines = result.properties.map((property) => formatProperty(property, verbose));
  if (!verbose) {
    return lines.join("\n");
  }

  return [`objectId: ${result.objectId}`, ...lines].join("\n");
}

function formatProperty(property: RuntimePropertyResult, verbose: boolean): string {
  const summary = summarizePropertyValue(property);
  const flags: string[] = [];
  if (!property.enumerable) flags.push("non-enumerable");
  if (property.isAccessor) flags.push("accessor");
  if (property.writable === false) flags.push("readonly");

  const head = flags.length > 0 ? `${property.name} [${flags.join(",")}] = ${summary}` : `${property.name} = ${summary}`;
  if (!verbose) {
    return head;
  }

  const lines = [head];
  if (property.className) lines.push(`  className: ${property.className}`);
  if (property.description && property.objectId) lines.push(`  description: ${property.description}`);
  if (property.objectId) lines.push(`  objectId: ${property.objectId}`);
  return lines.join("\n");
}

function summarizePropertyValue(property: RuntimePropertyResult): string {
  if (property.isAccessor && !property.objectId && property.type === undefined && property.description === undefined) {
    return "[accessor]";
  }

  const summary = summarizeRemoteValue(property);
  return property.objectId ? `${summary} (objectId: ${property.objectId})` : summary;
}

function summarizeRemoteValue(value: {
  type?: string;
  subtype?: string;
  className?: string;
  description?: string;
  value?: unknown;
  unserializableValue?: string;
  objectId?: string;
}): string {
  if (value.unserializableValue) {
    return `${value.type ?? "value"}: ${value.unserializableValue}`;
  }

  if (!value.objectId) {
    return `${value.type ?? typeof value.value}: ${formatInlineValue(value.value)}`;
  }

  const label = value.subtype || value.className || value.type || "object";
  const description = value.description && value.description !== label ? ` ${truncate(value.description, 120)}` : "";
  return `${label}${description}`;
}

function formatInlineValue(input: unknown): string {
  if (typeof input === "string") {
    return JSON.stringify(truncate(input, 200));
  }

  if (input === undefined) {
    return "undefined";
  }

  return truncate(JSON.stringify(input) ?? String(input), 200);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
