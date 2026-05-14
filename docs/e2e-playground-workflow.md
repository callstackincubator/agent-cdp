# E2E Playground Workflow

This repository uses the Expo app in `./playground` as the standard harness for end-to-end checks involving `agent-device` and `agent-cdp`.

## Goal

Validate the real user flow and the runtime inspection flow together:

1. A device automation agent can operate the app reliably.
2. agent-cdp can observe the runtime side effects triggered by those actions.

## Standard Flow

1. Confirm the app opens to the single-screen button harness.
2. Verify `agent-device` can identify and tap the scenario buttons by their visible labels.
3. Connect agent-cdp to the running app session.
4. Tap `Retain 250 objects` and confirm retained memory signals increase.
5. Tap `Retain 1200 objects` and confirm the larger retained batch is visible in memory inspection output.
6. Tap `Create transient churn` and compare the result against retained-memory actions.
7. Tap `Emit console burst` and inspect the info, warning, and handled error entries in `agent-cdp` console output.
8. Tap `Run CPU hotspot` and `Run async burst` when validating trace or JS profiling commands.
9. Tap `Log inspection payload` and inspect the emitted runtime payload with agent-cdp console or runtime tooling.
10. Tap `Clear retained batches` and confirm the store is empty in the UI and the retained-memory signal drops.

## Expected Playground Signals

The current playground exposes these signals:

1. A global store at `globalThis.__agentCdpPlayground`.
2. Retained object batches for memory inspection.
3. Transient allocation churn for comparison.
4. Structured console payloads for runtime inspection.
5. Synchronous and asynchronous CPU-heavy workloads for trace and JS profiler validation.

## Reporting

When finishing a task, include:

1. The commands you ran.
2. The device flow you exercised with `agent-device`.
3. The agent-cdp checks you performed.
4. Any blockers, flaky behavior, or verification gaps.
