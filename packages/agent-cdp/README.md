# agent-cdp

**agent-cdp** is a command-line tool that connects to apps and pages through the **Chrome DevTools Protocol (CDP)**. Use it to list debuggable targets, inspect network traffic, stream console output, record traces, inspect JavaScript heap usage, capture and analyze heap snapshots, and run JavaScript CPU profiles, all without opening DevTools yourself.

## Compatibility

| Environment | Notes |
|-------------|--------|
| **Chrome / Chromium** | Requires a CDP debug endpoint, typically with remote debugging enabled (for example port `9222`). You can point the CLI at that endpoint explicitly, or let `target list` scan the default local ports. |
| **React Native** | Works with the Metro / dev tooling that exposes a CDP-compatible target list (often `http://127.0.0.1:8081` during development). `target list` scans that port by default, or you can pass the dev server URL explicitly. |
| **Node.js** | Supports attaching to Node processes started with **`--inspect`** or **`--inspect-brk`** (or the equivalent `NODE_OPTIONS`). They expose the same CDP discovery model as Chrome; `target list` scans the default inspect port (`http://127.0.0.1:9229`) automatically, or you can pass your `--inspect=host:port` URL explicitly. |

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

By default, `target list` scans these local discovery URLs in parallel:

- `http://127.0.0.1:9222`
- `http://127.0.0.1:9229`
- `http://127.0.0.1:8081`

Returned target IDs embed the discovery URL, so `target select <target-id>` does not require `--url`.

Default local scan:

```sh
agent-cdp target list
agent-cdp target select <target-id>
```

Chrome (example port):

```sh
agent-cdp target list --url http://127.0.0.1:9222
agent-cdp target select <target-id>
```

React Native (example Metro URL):

```sh
agent-cdp target list --url http://127.0.0.1:8081
```

Node.js (example default inspect port after starting your app with `node --inspect …`):

```sh
agent-cdp target list --url http://127.0.0.1:9229
agent-cdp target select <target-id>
```

If you pass `--url` to `target select`, it must match the discovery URL encoded in the target ID.

Clear the current selection when needed:

```sh
agent-cdp target clear
```

**3. Use the features you need**

- **Console** — list and fetch log lines: `console list`, `console get <id>`
- **Network** — bounded live capture plus persisted sessions: `network status`, `network start`, `network summary`, `network list`, `network request`, `network request-headers`, `network response-headers`, `network request-body`, `network response-body`
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

Commands are grouped as **daemon**, **target**, **console**, **network**, **trace**, **memory**, **mem-snapshot**, **js-memory**, **js-allocation**, **js-allocation-timeline**, **js-profile**, and **skills** (bundled reference files). See `agent-cdp --help` for exact syntax and options.

## Network inspection

Use `network` when you need compact request summaries first, then explicit drill-down commands for details.

Quick start:

```sh
agent-cdp network status
agent-cdp network start --name login-flow
# reproduce the failing or slow interaction
agent-cdp network stop
agent-cdp network summary --session net_1
agent-cdp network list --session net_1 --status failed
agent-cdp network request --session net_1 --id req_12
agent-cdp network response-headers --session net_1 --id req_12
agent-cdp network response-body --session net_1 --id req_12 --file ./response-body.txt
```

Default behavior:

- The daemon keeps an always-on live rolling buffer of the most recent `200` normalized requests for the active target.
- `network start` begins an empty persisted recording session. It does not backfill from the live buffer.
- When `--session` is omitted, `network` queries prefer the active or latest persisted session. If no session exists, they read from the live buffer.
- `network request` shows metadata, timing, sizes, redirects, and availability flags only. It does not print headers or body previews by default.
- Use `network request-headers`, `network response-headers`, `network request-body`, and `network response-body` for explicit drill-down.

Examples:

```sh
agent-cdp network list --type xhr --min-ms 500
agent-cdp network list --status 5xx --text graphql
agent-cdp network request --id req_7
agent-cdp network request-headers --id req_7 --name authorization
agent-cdp network response-body --id req_7
```

Current limitations:

- Network tooling depends on the target emitting usable CDP `Network.*` events.
- Support is capability-driven, not runtime-name-driven. There is no runtime-specific fallback instrumentation in v1.
- The live buffer is limited to the most recent `200` requests.
- Persisted sessions start empty and do not backfill from the live buffer.
- Default request detail omits headers and bodies.
- No request or response body previews are printed by default.
- Full request and response bodies may still be unavailable depending on target behavior, timing, and connection lifetime.
- Binary bodies may be easier to consume through `--file` export.
- No default redaction is applied in v1.
- WebSocket visibility is limited to handshake metadata in v1.
- There is no throttling, blocking, mocking, replay, or HAR export in v1.
- Timing, size, protocol, cache, and remote-endpoint metadata may be partial or absent depending on target behavior.
