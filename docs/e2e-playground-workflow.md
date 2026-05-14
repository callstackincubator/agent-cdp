# E2E Playground Workflow

This repository uses the Expo app in `./playground` as the standard harness for end-to-end checks involving `agent-device` and `agent-cdp`.

## Goal

Validate the real user flow and the runtime inspection flow together:

1. A device automation agent can operate the app reliably.
2. agent-cdp can observe the runtime side effects triggered by those actions.

## Setup

1. Install workspace dependencies with `pnpm install` from the repo root.
2. Start the Expo app with `pnpm --dir playground start`.
3. Open the app on an iOS simulator, Android emulator, or physical device.
4. Use `agent-device` to attach to the device session before running interaction checks.

## Standard Flow

1. Confirm the app opens on the `Scenarios` tab.
2. Verify `agent-device` can identify and tap the scenario buttons by their visible labels.
3. Connect agent-cdp to the running app session.
4. Tap `Retain 250 objects` and confirm retained memory signals increase.
5. Tap `Retain 1200 objects` and confirm the larger retained batch is visible in memory inspection output.
6. Tap `Create transient churn` and compare the result against retained-memory actions.
7. Tap `Log inspection payload` and inspect the emitted runtime payload with agent-cdp console or runtime tooling.
8. Tap `Clear retained batches` and confirm the store is empty in the UI and the retained-memory signal drops.

## Expected Playground Signals

The current playground exposes these signals:

1. A global store at `globalThis.__agentCdpPlayground`.
2. Retained object batches for memory inspection.
3. Transient allocation churn for comparison.
4. Structured console payloads for runtime inspection.

## Reporting

When finishing a task, include:

1. The commands you ran.
2. The device flow you exercised with `agent-device`.
3. The agent-cdp checks you performed.
4. Any blockers, flaky behavior, or verification gaps.
