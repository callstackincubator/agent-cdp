# agent-cdp

`agent-cdp` is a lightweight CLI for talking to Chrome DevTools Protocol targets from the command line.

It is built for agent-friendly workflows and currently supports:

- persistent daemon-backed connections
- Chrome target discovery via `/json/list`
- React Native target discovery via `dev-middleware` `/json/list`
- console collection
- raw trace recording
- heap snapshot capture

## Install

```sh
pnpm install
pnpm run build
```

Run the built CLI with:

```sh
pnpm run agent-cdp -- <command>
```

## Quick Start

Start the daemon:

```sh
pnpm run agent-cdp -- start
pnpm run agent-cdp -- status
```

List available targets:

```sh
pnpm run agent-cdp -- target list --url http://127.0.0.1:9222
pnpm run agent-cdp -- target list --url http://127.0.0.1:8081
```

Select a target:

```sh
pnpm run agent-cdp -- target select <target-id> --url http://127.0.0.1:9222
```

Read console messages:

```sh
pnpm run agent-cdp -- console list
pnpm run agent-cdp -- console get 1
```

Record a trace:

```sh
pnpm run agent-cdp -- trace start
pnpm run agent-cdp -- trace stop --file ./trace.json
```

Capture a heap snapshot:

```sh
pnpm run agent-cdp -- memory capture --file ./snapshot.heapsnapshot
```

Stop the daemon:

```sh
pnpm run agent-cdp -- stop
```

## Commands

```text
Daemon:
  start
  stop
  status

Targets:
  target list --url URL
  target select <id> --url URL
  target clear

Console:
  console list [--limit N]
  console get <id>

Trace:
  trace start
  trace stop [--file PATH]

Memory:
  memory capture --file PATH
```

## Notes

- Discovery expects a CDP-compatible `/json/list` endpoint, for example Chrome on `http://127.0.0.1:9222` or React Native dev middleware on `http://127.0.0.1:8081`.
- Trace reporting and heap snapshot analysis are not implemented yet; current support is raw capture only.
