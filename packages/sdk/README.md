# @agent-cdp/sdk

`@agent-cdp/sdk` is the app-side runtime bridge for `agent-cdp`. It lets running application code trigger a focused subset of daemon-backed inspection and profiling actions from inside the target app.

## Install

```sh
npm install @agent-cdp/sdk
```

For workspace development from this repository:

```sh
pnpm install
pnpm run build
```

## Setup

1. Start the daemon with `agent-cdp start`.
2. Select the running app target with `agent-cdp target list` and `agent-cdp target select <target-id>`.
3. Call the SDK from app code after the bridge is injected into the selected runtime.

If no target is selected, SDK calls reject because the runtime bridge is not installed.

## Usage

```ts
import { cpuProfile } from "@agent-cdp/sdk";

export async function runProfiledAction() {
  await cpuProfile.start({ name: "checkout-submit" });

  try {
    await submitCheckout();
    await flushPostSubmitWork();
  } finally {
    const sessionId = await cpuProfile.stop();
    console.log("agent-cdp CPU profile session", sessionId);
  }
}
```

## Available modules

- `cpuProfile`: `start`, `status`, `stop`
- `allocation`: `start`, `status`, `stop`
- `allocationTimeline`: `start`, `status`, `stop`
- `memoryUsage`: `sample`
- `memorySnapshot`: `capture`
- `network`: `start`, `status`, `stop`
- `trace`: `start`, `status`, `stop`
- `AgentRuntimeClient`: direct client when you need custom timeout or binding names
