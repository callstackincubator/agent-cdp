# Runtime SDK Bridge

`@agent-cdp/sdk` is the app-side bridge for `agent-cdp`. It lets running app code send a small set of commands back to the selected daemon session.

Current scope: in-app control of JavaScript CPU profiling.

Use it when the interesting profiling boundary is easiest to define inside the app, for example around a specific button flow, async burst, or app-owned benchmark helper. Start and stop the capture in code, then inspect the recorded session with the existing CLI profiling commands.

## Setup

1. Add `@agent-cdp/sdk` to the app.
2. Start the daemon: `agent-cdp start`
3. Select the running app target with `agent-cdp target list` and `agent-cdp target select <target-id>`.

The bridge is injected by the selected target session. If no target is selected, SDK calls reject with a bridge-not-installed error.

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

Available calls:

- `cpuProfile.start({ name?, samplingIntervalUs? })`
- `cpuProfile.status()`
- `cpuProfile.stop()`

`cpuProfile.status()` returns whether a profile is active plus the active name, elapsed time, and retained session count. `cpuProfile.stop()` returns the recorded session ID.

## Workflow

1. Connect `agent-cdp` to the app target.
2. Trigger `cpuProfile.start()` from app code just before the work you want.
3. Run the target flow.
4. Call `cpuProfile.stop()` and keep the returned session ID.
5. Analyze that same session with the CLI.