---
name: runtime
description: Runtime inspection workflows for agent-cdp. Use after reading the core skill and selecting a target. Covers expression evaluation, preserved remote object handles, property inspection, and explicit release for Chrome, Node.js, and React Native targets.
allowed-tools: Bash(agent-cdp:*)
---

# agent-cdp runtime

Use `runtime` when you need live state inspection against the currently selected target.

This is the fastest path for an LLM agent to answer questions like:

- What is the current value of a global or module-level variable?
- What properties exist on this object right now?
- Does the runtime state match what the logs suggest?

## Commands

```bash
agent-cdp runtime eval --expr EXPR [--await] [--json]
agent-cdp runtime props --id OBJECT_ID [--own] [--accessor-properties-only]
agent-cdp runtime release --id OBJECT_ID
agent-cdp runtime release-group [--group NAME]
```

## Safe workflow

```bash
agent-cdp runtime eval --expr "globalThis.store"
agent-cdp runtime props --id <OBJECT_ID> --own
agent-cdp runtime release --id <OBJECT_ID>
```

If you evaluate several objects during a session, release the whole group when done:

```bash
agent-cdp runtime release-group
```

## Preserved by default

Runtime object handles are preserved by default.

That means:

- `runtime eval` may return an `objectId` for a live remote object
- you can pass that `objectId` to `runtime props`
- the handle stays available until you explicitly release it or release its group

This is intentional because LLM agents often need a follow-up inspection step after evaluation.

Releasing a handle does not delete the real application object. It only drops the inspector-side reference used by the debugging session.

## `objectId` and object groups

- `objectId` is a remote inspector handle, not a serialized value
- preserved handles are placed in the default group `agent-cdp-runtime`
- use `runtime release --id ...` for one handle
- use `runtime release-group` to clean up the default group in bulk

In long-lived daemon sessions, release handles you no longer need.

## Side effects

`runtime eval` runs code in the target runtime. It is not automatically read-only.

Prefer expressions that inspect state without mutating it, for example:

```bash
agent-cdp runtime eval --expr "process.version"
agent-cdp runtime eval --expr "globalThis.__APP_STATE__"
agent-cdp runtime eval --expr "Array.isArray(globalThis.items) ? globalThis.items.length : null"
```

Avoid expressions that trigger writes, network calls, or state transitions unless you mean to do that.

## Cross-target notes

The Runtime commands are intended to work with:

- Chrome / Chromium pages with CDP enabled
- Node.js processes started with `--inspect` or `--inspect-brk`
- React Native targets exposed through Metro / the RN debugger endpoint

Examples:

```bash
agent-cdp target list --url http://localhost:9222
agent-cdp target list --url http://localhost:9229
agent-cdp target list --url http://localhost:8081
```

Then select the target and inspect runtime state.

## React Native / Hermes promises

On React Native targets backed by Hermes, do not assume `runtime eval --await` will unwrap a promise into its fulfillment value.

Some Hermes targets also reject `async`/`await` syntax at parse time, so avoid using async functions as a probe unless you have already confirmed the target accepts them.

If `--await` returns a promise handle instead of the resolved value:

1. Re-run `runtime eval` without `--await` to get the remote object handle.
2. Inspect the handle with `runtime props --id <OBJECT_ID> --own`.
3. Look for Hermes promise internals such as `_h`, `_i`, `_j`, and `_k`.
4. In practice, `_j` often holds the fulfilled value once the promise settles, while `_k` may be `null`.
5. If you only need to confirm settlement, treat a non-null `_j` as the most useful clue and avoid assuming the inspector will serialize the resolved value for you.

Use this workflow for debugging RN promise state instead of relying on native async syntax or promise unwrapping in the inspector path.
