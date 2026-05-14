import { getCliFailure } from "./cli/error.js";
import { main } from "./cli.js";

void main().catch((error: unknown) => {
  const failure = getCliFailure(error);
  if (failure.message) {
    console.error(failure.message);
  }
  process.exit(failure.exitCode);
});
