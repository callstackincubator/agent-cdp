# 004 React Native console resilience

## Status

- [x] Done

## Blocked by

- `003-console-tools-core.md`

## Goal

Make the console slice robust for React Native by handling reloads, reconnects, and no-page periods exposed through `dev-middleware`.

## Acceptance criteria

- [x] React Native targets are discoverable from dev middleware.
- [x] Console domains are re-enabled after reconnect/reload.
- [x] Status output explains disconnected states clearly.
- [x] Tests cover reconnect handling.
