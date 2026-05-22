import type { AgentPluginTargetSession } from "../../plugin.js";
import {
  BOOTSTRAP_POLL_INTERVAL_MS,
  BOOTSTRAP_POLL_MAX_ATTEMPTS,
  RUNTIME_GLOBAL,
} from "./protocol.js";

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

async function pollForRuntime(
  session: AgentPluginTargetSession,
  signal: AbortSignal | undefined,
): Promise<void> {
  for (let attempt = 0; attempt < BOOTSTRAP_POLL_MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw abortError();

    const result = (await session.send("Runtime.evaluate", {
      expression: `typeof globalThis.${RUNTIME_GLOBAL} !== 'undefined'`,
      returnByValue: true,
    })) as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;

    if (result?.result?.value === true) return;

    if (attempt === BOOTSTRAP_POLL_MAX_ATTEMPTS - 1) {
      throw new Error(`Timed out waiting for ${RUNTIME_GLOBAL} to be available`);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, BOOTSTRAP_POLL_INTERVAL_MS));
  }
}

async function getBindingName(session: AgentPluginTargetSession): Promise<string> {
  const result = (await session.send("Runtime.evaluate", {
    expression: `globalThis.${RUNTIME_GLOBAL}.BINDING_NAME`,
    returnByValue: true,
  })) as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;

  if (result?.exceptionDetails) {
    throw new Error("Failed to get binding name: " + JSON.stringify(result.exceptionDetails));
  }

  const value = result?.result?.value;
  if (typeof value !== "string" || !value) {
    throw new Error(`Unexpected binding name value: ${JSON.stringify(value)}`);
  }

  return value;
}

export async function runBootstrap(
  session: AgentPluginTargetSession,
  signal?: AbortSignal,
): Promise<string> {
  await session.send("Runtime.enable");
  if (signal?.aborted) throw abortError();

  await pollForRuntime(session, signal);
  if (signal?.aborted) throw abortError();

  const bindingName = await getBindingName(session);
  if (signal?.aborted) throw abortError();

  await session.send("Runtime.addBinding", { name: bindingName });

  console.log(`[Rozenite] Bootstrap: binding name = ${bindingName}`);
  return bindingName;
}
