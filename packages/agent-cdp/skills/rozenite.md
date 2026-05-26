---
name: rozenite
description: Rozenite in-app agent tools via agent-cdp. Use after core target selection. React Native via Metro/Fusebox; Chrome only with the Rozenite browser extension installed.
allowed-tools: Bash(agent-cdp:*)
---

# agent-cdp rozenite

Call tools registered in the app or page through the Rozenite CDP bridge.

Prerequisite: `agent-cdp skills get core`, then `start` → `target list` → `target select`.

## Targets

- **React Native** — Metro debug target (`--url http://localhost:8081`). App must use **Rozenite**.
- **Chrome** — CDP tab target (`--url http://localhost:9222`). Requires the **Rozenite browser extension**; without it bootstrap times out.

Check readiness: `agent-cdp rozenite status` (works while bootstrapping).

## Commands

```bash
agent-cdp rozenite status
agent-cdp rozenite tools
agent-cdp rozenite tool-schema <name>
agent-cdp rozenite call <name> [--input '{"key":"value"}']
```

`status` returns `state` (`idle` | `waiting-for-runtime` | `ready` | `error` | `unsupported-target`), `toolCount`, and `target`. Other commands need `state: ready`.

## Troubleshooting

- **`waiting-for-runtime` / timeout** — Fusebox dispatcher missing: RN needs Rozenite in Metro; Chrome needs the extension on that tab.
- **`toolCount: 0` but `ready`** — App has not registered tools yet; wait for `register-tool` events.
- **Call hangs** — Tool handler not returning; default timeout 30s.
