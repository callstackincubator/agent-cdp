# agent-cdp

**agent-cdp** is a command-line tool that connects to apps and pages through the **Chrome DevTools Protocol (CDP)**. Use it to list debuggable targets, stream console output, record traces, inspect JavaScript heap usage, capture and analyze heap snapshots, and run JavaScript CPU profiles—all without opening DevTools yourself.

## Compatibility

| Environment | Notes |
|-------------|--------|
| **Chrome / Chromium** | Requires a CDP debug endpoint, typically with remote debugging enabled (for example port `9222`). You point the CLI at the `/json/list` URL for that endpoint. |
| **React Native** | Works with the Metro / dev tooling that exposes a CDP-compatible target list (often `http://127.0.0.1:8081` during development). Same flow as Chrome: `target list` with the dev server URL. |
| **Node.js** | Supports attaching to Node processes started with **`--inspect`** or **`--inspect-brk`** (or the equivalent `NODE_OPTIONS`). They expose the same CDP discovery model as Chrome; point `target list` at the inspector base URL (often `http://127.0.0.1:9229` for the default port, or your `--inspect=host:port` value). |

Anything that exposes the same style of CDP HTTP discovery (`/json/list`) and WebSocket debugging should work; behavior depends on what the target implements.

## Install

Install the CLI globally with **npm**:

```sh
npm install -g agent-cdp
```

Run it as:

```sh
agent-cdp <command> [options]
```

For the full command tree and flags:

```sh
agent-cdp --help
```

**Developing from source:** clone the repository, run `pnpm install` and `pnpm run build`, then from the repo root use `pnpm run agent-cdp -- <command> [options]` (or run `node packages/agent-cdp/dist/cli.js` directly).

## Quick start

**1. Start the background connection helper (daemon)**

```sh
agent-cdp start
agent-cdp status
```

**2. List targets and select one**

Chrome (example port):

```sh
agent-cdp target list --url http://127.0.0.1:9222
agent-cdp target select <target-id> --url http://127.0.0.1:9222
```

React Native (example Metro URL):

```sh
agent-cdp target list --url http://127.0.0.1:8081
```

Node.js (example default inspect port after starting your app with `node --inspect …`):

```sh
agent-cdp target list --url http://127.0.0.1:9229
agent-cdp target select <target-id> --url http://127.0.0.1:9229
```

Clear the current selection when needed:

```sh
agent-cdp target clear
```

**3. Use the features you need**

- **Console** — list and fetch log lines: `console list`, `console get <id>`
- **Trace** — `trace start` / `trace stop [--file PATH]` for raw trace capture
- **Memory (raw)** — `memory capture --file PATH` for a heap snapshot file
- **Heap snapshot tools** — `mem-snapshot` commands to capture, load, summarize, diff snapshots, inspect classes/instances/retainers, and triage leak-style comparisons
- **JS heap monitor** — `js-memory` commands for sampling, summaries, diffs, trends, and leak-oriented signals
- **JS allocation profiler** — `js-allocation` commands for sampled allocation timeline summaries, top allocators, bucketed growth, leak-oriented signals, and raw artifact export
- **JS allocation timeline** — `js-allocation-timeline` commands for DevTools-style heap allocation timeline capture, bucket summaries, linked final snapshot analysis, and raw artifact export
- **JS profiler** — `js-profile` commands to record CPU profiles, list sessions, hotspots, stacks, diffs, and optional source map help

**4. Stop the daemon**

```sh
agent-cdp stop
```

## Command overview

Commands are grouped as **daemon**, **target**, **console**, **trace**, **memory**, **mem-snapshot**, **js-memory**, **js-allocation**, **js-allocation-timeline**, **js-profile**, and **skills** (bundled reference files). See `agent-cdp --help` for exact syntax and options.
