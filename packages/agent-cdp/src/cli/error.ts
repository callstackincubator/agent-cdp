import { CommanderError } from "commander";

export function getCliFailure(error: unknown): { message: string | null; exitCode: number } {
  if (error instanceof CommanderError) {
    return { message: null, exitCode: error.exitCode };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    exitCode: 1,
  };
}
