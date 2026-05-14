# agent-cdp Agent Guide

Use the Expo app in `./playground` as the default end-to-end verification target for product changes that affect runtime inspection, memory tooling, or agent workflows.

## Expectations

1. Prefer validating changes through the running playground app instead of stopping at unit tests.
2. Use `agent-device` to launch the app, navigate between tabs, tap scenario buttons, and confirm the UI state changes on a real simulator or device.
3. When the change touches agent-cdp inspection features, connect agent-cdp to the running playground session and verify the expected runtime or memory signals appear after UI actions.
4. Record what was exercised, what passed, and any gaps if full E2E verification was not possible.

## Reference

Follow the detailed workflow in `docs/e2e-playground-workflow.md`.
