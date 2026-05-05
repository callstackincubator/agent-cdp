# AGENTS.md

Minimal operating guide for AI coding agents in this repo.

## First Minute
- Classify the task first:
  - Info-only, review, triage, docs: no code edits and no test runs unless explicitly requested.
  - Code change: make the smallest scoped edit and run only the checks required by touched scope.
- State assumptions explicitly. If target type or runtime is unclear, ask.
- If the task touches CLI behavior, daemon lifecycle, build tooling, or validation, read `package.json`, `packages/agent-cdp/package.json`, and `packages/agent-cdp/src/cli.ts` before deeper source files.
- Prefer repo scripts over ad hoc command bundles:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
- Read at most 3 files first:
  - owning module
  - one adjacent helper/module
  - one relevant test file
- Define success criteria before editing.
- Decide up front whether docs or skills need updates.

## Scope
- Solve issues with the smallest context read.
- Keep changes scoped to one command family or one module group.
- Preserve daemon-backed session semantics unless the task explicitly changes them.
- Expand only when a contract crosses module boundaries.
- If the fix expands beyond one command family, stop and confirm.

## Code Changes
- Minimum code that solves the problem.
- No speculative features.
- No new abstraction for one call site.
- Organize code into feature modules so code responsible for similar behavior stays local.
- Match existing style and naming.
- Remove unused imports or variables introduced by your change only.
- Prefer type-level guarantees over duplicate runtime tests when TypeScript already proves the contract.
- Keep files agent-readable:
  - avoid growing already-large router files
  - prefer extracting focused helpers before adding another major command branch to `src/cli.ts` or `src/daemon.ts`
- Keep `packages/agent-cdp/src/daemon.ts` as an IPC command router and orchestrator, not the home for analysis logic.
- Keep `packages/agent-cdp/src/cli.ts` focused on argument parsing, command dispatch, and formatting.
- Put command logic in domain modules:
  - target discovery: `src/discovery.ts`
  - session lifecycle and reconnects: `src/session-manager.ts`
  - CDP transport: `src/transport.ts`
  - console capture: `src/console.ts`
  - raw trace capture: `src/trace.ts`
  - raw heap snapshot capture: `src/memory.ts`
  - heap snapshot analysis: `src/heap-snapshot/*`
  - JS heap usage monitor: `src/js-memory/*`
  - JS CPU profiler: `src/js-profiler/*`
- Keep providers thin. `src/providers.ts` should choose the transport, not own session policy.
- Preserve the daemon lifecycle: `start` -> `target list/select` -> capture/analyze -> `stop`.
- Preserve newline-delimited JSON IPC between CLI and daemon.
- React Native reconnect logic must prefer stable logical identity (`logicalDeviceId` plus `appId`) over raw transient target id.
- Ignore discovery entries that do not expose `webSocketDebuggerUrl`.
- `WebSocketCdpTransport` owns CDP request/response correlation and must reject pending requests when the socket closes.
- Raw `memory capture` and analyzed `mem-snapshot` workflows must stay distinct.
- Optimize CLI output for token usage. If data can be large, prefer a concise summary in the default output and expose follow-up commands or flags for drilling into details.
- Do not use JSON as the default CLI output format.
- If CLI workflows or flags change, update both `src/cli.ts` usage text and `packages/agent-cdp/skills/core.md`.

## Toolchain
- Package manager: `pnpm` only.
- Workspace root scripts are the default entrypoint.
- Package build uses `tsup`.
- Typecheck uses `tsc --noEmit`.
- Lint/format stack is OXC: `oxlint`, `oxfmt`.
- TypeScript is strict and ESM-based. Preserve `moduleResolution: "bundler"` unless the task explicitly changes build behavior.
- Do not add `package-lock.json`.

## Cheap Exploration
- Prefer first-pass searches over broad reading:
  - `rg -n "<command|symbol|flag>" packages/agent-cdp/src`
  - `rg --files packages/agent-cdp/src`
  - `git diff -- <path>`
- Read the command usage in `src/cli.ts` before changing CLI surface.
- Read the closest test before adding a new test pattern.
- Prefer reading the owning analysis folder over scanning the whole repo.
- Do not read unrelated analysis families once the owning module is identified.
- Do not inspect both Chrome and React Native paths unless the task is cross-target.
- Prefer targeted diffs and focused reads over scanning long files repeatedly.

## Command Family Lookup
- daemon lifecycle and IPC: `src/daemon.ts`, `src/daemon-client.ts`
- target discovery and selection: `src/discovery.ts`, `src/session-manager.ts`, `src/providers.ts`
- console: `src/console.ts`, `src/__tests__/console.test.ts`
- trace: `src/trace.ts`, `src/__tests__/trace.test.ts`
- raw memory capture: `src/memory.ts`, `src/__tests__/memory.test.ts`
- heap snapshot analysis: `src/heap-snapshot/*`
- JS heap usage: `src/js-memory/*`
- JS CPU profiling: `src/js-profiler/*`
- CLI help and parsing: `src/cli.ts`, `src/__tests__/cli.test.ts`
- formatting: `src/formatters.ts`, `src/heap-snapshot/formatters.ts`, `src/js-memory/formatters.ts`, `src/js-profiler/formatters.ts`

## Pull Requests
- Start the PR description with end-user impact:
  - what changed
  - what new capability, fix, or workflow improvement the tool user gets
  - how the user is expected to use or notice it
- Include backward-compatibility analysis:
  - whether existing commands, flags, outputs, saved artifacts, and daemon behavior remain compatible
  - whether the change alters defaults, output shape, persistence, or workflows
  - if compatibility risk exists, call it out plainly
- Include a `Risks` section:
  - possible regressions
  - target-specific risks such as Chrome vs React Native differences
  - daemon/session/transport risks
  - output-format or scripting compatibility risks
- Include a `Manual testing` section with a concrete scenario:
  - exact setup assumptions
  - exact commands to run
  - what to verify after each step
  - expected observable outcome from a user perspective
- Keep PRs short, factual, and reviewer-friendly.

## Priority Order
- When guidance conflicts, apply in this order:
  - scope
  - code changes
  - toolchain
  - cheap exploration
  - style/preferences
