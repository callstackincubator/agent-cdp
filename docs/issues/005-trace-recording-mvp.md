# 005 Trace recording MVP

## Status

- [x] Done

## Blocked by

- `002-daemon-transport-skeleton.md`

## Goal

Add start/stop trace recording with raw trace persistence and capability checks.

## Acceptance criteria

- [x] CLI exposes trace start/stop commands.
- [x] Daemon tracks active trace session state.
- [x] Raw trace output can be saved.
- [x] Unsupported targets fail with explicit capability messaging.
