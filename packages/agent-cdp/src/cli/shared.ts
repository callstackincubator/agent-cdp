import type { Command } from "commander";
import type { IpcResponse } from "../types.js";

export function getVerbose(command: Command): boolean {
  const options = command.optsWithGlobals() as { verbose?: boolean };
  return options.verbose === true;
}

export function parseInteger(value?: string): number | undefined {
  return typeof value === "string" ? Number.parseInt(value, 10) : undefined;
}

export function parseFloatNumber(value?: string): number | undefined {
  return typeof value === "string" ? Number.parseFloat(value) : undefined;
}

export function parseRequiredInteger(value: string | undefined, usageText: string): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (Number.isNaN(parsed)) {
    throw new Error(usageText);
  }
  return parsed;
}

export function parseRequiredFloat(value: string | undefined, usageText: string): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (Number.isNaN(parsed)) {
    throw new Error(usageText);
  }
  return parsed;
}

export function unwrapResponse(response: IpcResponse, fallback: string): unknown {
  if (!response.ok) {
    throw new Error(response.error || fallback);
  }
  return response.data;
}
