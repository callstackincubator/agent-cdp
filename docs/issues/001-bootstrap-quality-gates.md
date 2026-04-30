# 001 Bootstrap quality gates

## Status

- [x] Done

## Blocked by

None - can start immediately.

## Goal

Create the initial workspace and package layout for `agent-cdp`, mirror the `agent-react-devtools` architecture at a high level, and wire the baseline tooling and CI needed for iterative MVP delivery.

## Acceptance criteria

- [x] Root workspace is configured for `packages/*`.
- [x] `packages/agent-cdp` exists with a buildable TypeScript package.
- [x] Minimal CLI and persistent daemon skeleton build successfully.
- [x] `oxfmt`, `oxlint`, `tsc`, `vitest`, and `tsup` are configured.
- [x] Pre-commit hooks run formatting, linting, and typechecks.
- [x] GitHub Actions run checks on pull requests.
- [x] Markdown issue tracker exists as multiple files under `docs/issues`.

## Notes

- MVP scope for this slice is limited to repository scaffolding and lifecycle commands (`start`, `stop`, `status`).
- Extensibility seams are introduced now for target/session abstractions so later Chrome and React Native implementations can slot in without reworking the daemon contract.
