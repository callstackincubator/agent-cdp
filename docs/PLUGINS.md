# Built-in plugin system

`agent-cdp` has a built-in plugin system for adding target-scoped integrations without touching the core daemon, dispatcher, CLI, or protocol types.

## How it works

- **Protocol** — all plugin traffic uses one generic IPC envelope: `{ type: "plugin-command", pluginId, command, input }`. The protocol union never needs to widen for a new plugin.
- **`AgentPlugin` interface** — a plugin declares a unique `id`, a list of static `AgentPluginCommand` entries, a `supportsTarget()` predicate, a `getState()` method, and optional daemon/target lifecycle hooks (`onDaemonStart`, `onTargetSelected`, `onTargetReconnected`, `onTargetCleared`, etc.).
- **`PluginOrchestrator`** — the daemon-owned host that registers plugins, validates unique ids, routes lifecycle events, and dispatches plugin IPC commands. It enforces `supportsTarget` state checks before calling `execute()` so plugin commands fail with a clear message when the active target is unsupported.
- **CLI registration** — each plugin module exports a `registerCliCommands(program, deps)` function. `createProgram` calls it at startup, adding a static `agent-cdp <plugin-id> <command>` subcommand family. Commands are never added dynamically after a target connects.

## Adding a plugin

1. Create `packages/agent-cdp/src/plugins/<id>/index.ts` implementing `AgentPlugin`.
2. Export `registerCliCommands(program, deps)` from the same file. CLI subcommands send `{ type: "plugin-command", pluginId: "<id>", command: "<name>", input: {...} }`.
3. Instantiate the plugin and add it to `new PluginOrchestrator([...])` in `src/daemon.ts`.
4. Add `{ registerCliCommands }` to `BUILT_IN_PLUGINS` in `src/cli/index.ts`.

No other files need to change. See `src/plugin.ts` for the full interface contract and `src/plugins/runtime-bridge/index.ts` for the reference implementation.