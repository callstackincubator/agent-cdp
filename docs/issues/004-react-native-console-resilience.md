# 004 React Native console resilience

## Status

- [ ] Open

## Blocked by

- `003-console-tools-core.md`

## Goal

Make the console slice robust for React Native by handling reloads, reconnects, and no-page periods exposed through `dev-middleware`.

## Acceptance criteria

- [ ] React Native targets are discoverable from dev middleware.
- [ ] Console domains are re-enabled after reconnect/reload.
- [ ] Status output explains disconnected states clearly.
- [ ] Tests cover reconnect handling.
