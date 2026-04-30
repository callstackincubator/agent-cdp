# 002 Daemon transport skeleton

## Status

- [x] Done

## Blocked by

- `001-bootstrap-quality-gates.md`

## Goal

Add the unified target discovery and CDP transport/session abstractions behind the daemon, with enough lifecycle wiring to support future console and profiling slices.

## Acceptance criteria

- [x] Target discovery interfaces exist.
- [x] CDP transport/session interfaces exist.
- [x] Daemon can manage target selection state.
- [x] Chrome and React Native provider skeletons exist.
- [x] Tests cover daemon-side session orchestration basics.
