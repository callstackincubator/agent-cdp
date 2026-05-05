# CONTRIBUTING.md

## Working On `agent-cdp`

- The repo is a small `pnpm` workspace with one package at `packages/agent-cdp`.
- Root scripts are the default entrypoint for build, lint, test, typecheck, and format.
- The shipped CLI is built output, so run `pnpm build` before using `pnpm run agent-cdp -- ...` locally.

## First Pass

- Read `packages/agent-cdp/src/cli.ts` first for command surface and agent-facing help.
- For runtime behavior, follow this split:
  - daemon and IPC: `src/daemon.ts`, `src/daemon-client.ts`
  - target discovery and session selection: `src/discovery.ts`, `src/session-manager.ts`
  - domain features: `src/console.ts`, `src/trace.ts`, `src/memory.ts`, `src/heap-snapshot/*`, `src/js-memory/*`, `src/js-profiler/*`

## Local Validation

- Use:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm format`
- Keep CLI output token-efficient: default to summaries for large result sets and add follow-up commands or flags for deeper inspection when needed.
- Do not default CLI output to JSON.
- If you change CLI commands, flags, or workflows, update both:
  - `packages/agent-cdp/src/cli.ts`
  - `packages/agent-cdp/skills/core.md`

## Manual Workflow

- Typical local loop:
  - `pnpm build`
  - `pnpm run agent-cdp -- start`
  - `pnpm run agent-cdp -- target list --url <CDP_URL>`
  - `pnpm run agent-cdp -- target select <id> --url <CDP_URL>`
  - run the feature you changed
- Chrome usually uses `http://127.0.0.1:9222`.
- React Native usually uses Metro at `http://127.0.0.1:8081`.
