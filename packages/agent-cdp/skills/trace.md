---
name: trace
description: Trace inspection workflows for agent-cdp. Use after reading the core skill and selecting a target. Covers explicit trace capture, in-memory trace sessions, user timing inspection, custom DevTools tracks, token-efficient navigation, and raw trace export when needed.
allowed-tools: Bash(agent-cdp:*)
---

# agent-cdp trace

Focused guide for trace capture and inspection after the daemon is running and a target has been selected.

Prerequisite:

```bash
agent-cdp skills get core
agent-cdp start
agent-cdp target list --url URL
agent-cdp target select <id> --url URL
```

## Mental model

- Tracing is explicit. The daemon does not start recording on startup.
- `trace start` begins a raw CDP trace capture for the selected target.
- `trace stop` ends capture, analyzes the trace in memory, and stores a queryable trace session in the daemon.
- `trace stop --file PATH` also exports the raw `traceEvents` JSON if you need the underlying trace file.
- Without `--session`, trace queries read from the latest analyzed session.
- Default trace output is intentionally compact so agents can navigate the data in chunks.

## Commands

```bash
agent-cdp trace start
agent-cdp trace stop [--file PATH]

agent-cdp trace status
agent-cdp trace list [--limit N] [--offset N]
agent-cdp trace summary [--session ID]
agent-cdp trace tracks [--session ID] [--limit N] [--offset N] [--text TEXT] [--group NAME]
agent-cdp trace entries [--session ID] [--track NAME] [--type measure|mark|stamp] [--text TEXT] [--start-ms N] [--end-ms N] [--limit N] [--offset N] [--sort time|duration|name]
agent-cdp trace entry --id ENTRY_ID [--session ID]
```

## What trace analysis can inspect

- plain `performance.measure()` entries
- plain `performance.mark()` entries
- `console.timeStamp()` entries
- custom track and group metadata attached through DevTools-style `detail.devtools` payloads on user timing entries
- custom tracks emitted through `devtools.timeline` `TimeStamp` events, including React DevTools timeline data

## Workflow: Capture And Inspect A Fresh Trace

```bash
agent-cdp trace start
# reproduce the interaction you want to inspect
agent-cdp trace stop
agent-cdp trace summary
agent-cdp trace tracks
agent-cdp trace entries
```

Use this when you want the latest interaction summarized without dumping raw trace JSON into the terminal.

## Workflow: Navigate In Small Chunks

Start broad, then narrow.

```bash
agent-cdp trace summary
agent-cdp trace tracks --limit 10
agent-cdp trace entries --limit 10
agent-cdp trace entry --id te_1
```

This is the preferred agent loop because it minimizes tokens while preserving drill-down.

## Workflow: Focus On A Specific Track

```bash
agent-cdp trace tracks --group "Scheduler ⚛"
agent-cdp trace entries --track "Blocking" --limit 10
agent-cdp trace entries --track "Image Processing" --sort duration
```

Use `trace tracks` to discover the exact track names first, then filter `trace entries` by `--track`.

## Workflow: Focus On A Specific Entry Type

```bash
agent-cdp trace entries --type measure --limit 20
agent-cdp trace entries --type mark --text boot
agent-cdp trace entries --type stamp --track "Console Track"
```

Guidance:
- `measure` is usually the best default when triaging performance work
- `mark` is useful for lifecycle waypoints and custom markers
- `stamp` is useful for DevTools-style custom timeline entries

## Workflow: Time-Window Inspection

```bash
agent-cdp trace entries --start-ms 0 --end-ms 100 --sort duration
agent-cdp trace entries --track "Blocking" --start-ms 100 --end-ms 250
```

Use time windows to cut down noisy sessions before drilling into a specific entry id.

## Workflow: Inspect One Entry Fully

```bash
agent-cdp trace entries --track "Image Processing" --limit 5
agent-cdp trace entry --id te_16
```

`trace entry` is where you should expect to see the richest details such as tooltip text, custom properties, and any preserved user detail payload.

## Workflow: Export The Raw Trace

Use raw export only when the analyzed views do not answer the question or when you need to compare exact event shapes.

```bash
agent-cdp trace start
# reproduce the interaction
agent-cdp trace stop --file /tmp/trace.json
```

The exported file can be inspected directly or loaded in tools that understand Chrome trace JSON.

## Token-Efficient Navigation Tips

- Prefer `trace summary` before any list command.
- Use `trace tracks` to discover candidate tracks before scanning entries.
- Use `--limit` and `--offset` on `trace list`, `trace tracks`, and `trace entries`.
- Use `--text`, `--type`, `--track`, `--start-ms`, and `--end-ms` to narrow the result set before printing.
- Use `trace entry --id ...` for full detail on a single item rather than increasing list limits.

## Output Semantics

- `trace summary` reports a compact session overview with entry counts and top tracks.
- `trace tracks` reports active time by default, not the broader span between the first and last entry on that track.
- `trace tracks --verbose` includes the broader track span in addition to active time.
- `trace entries` defaults to measures for a narrower, more actionable list.

## Caveats

- Trace analysis is optimized for CLI summaries and drill-down, not flamechart rendering.
- Support is strongest for common user timing and DevTools custom-track shapes seen in Chrome and React DevTools.
- Some trace producers may emit unsupported event forms.
- Trace sessions are kept in a bounded in-memory history rather than persisted automatically.

## Suggested Agent Loop

When debugging a performance issue, prefer this order:

```bash
agent-cdp trace start
# reproduce the issue
agent-cdp trace stop
agent-cdp trace summary
agent-cdp trace tracks --limit 10
agent-cdp trace entries --track TRACK_NAME --limit 10
agent-cdp trace entry --id ENTRY_ID
```

Only export the raw file when the analyzed commands are not enough.
