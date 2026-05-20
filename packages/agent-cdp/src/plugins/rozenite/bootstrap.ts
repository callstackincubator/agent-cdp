import type { AgentPluginTargetSession } from "../../plugin.js";
import { DOMAIN_NAME, POLL_INTERVAL_MS, POLL_TIMEOUT_MS, RUNTIME_GLOBAL } from "./protocol.js";

export interface BootstrapResult {
  bindingName: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function bootstrapRozenite(
  session: AgentPluginTargetSession,
  signal: AbortSignal
): Promise<BootstrapResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("aborted");

    const evalResult = (await session.send("Runtime.evaluate", {
      expression: `typeof ${RUNTIME_GLOBAL} !== 'undefined'`,
      returnByValue: true,
    })) as { result: { value: unknown } };

    if (evalResult.result.value === true) break;

    await delay(POLL_INTERVAL_MS);
  }

  if (signal.aborted) throw new Error("aborted");

  if (Date.now() >= deadline) {
    throw new Error(
      `${RUNTIME_GLOBAL} not found after ${POLL_TIMEOUT_MS / 1000}s — is Rozenite integrated in this app?`
    );
  }

  const bindingResult = (await session.send("Runtime.evaluate", {
    expression: `${RUNTIME_GLOBAL}.BINDING_NAME`,
    returnByValue: true,
  })) as { result: { value: unknown } };

  const bindingName = String(bindingResult.result.value);

  await session.send("Runtime.addBinding", { name: bindingName });

  await session.send("Runtime.evaluate", {
    expression: `${RUNTIME_GLOBAL}.initializeDomain('${DOMAIN_NAME}')`,
  });

  return { bindingName };
}