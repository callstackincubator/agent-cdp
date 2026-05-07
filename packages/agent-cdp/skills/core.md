---
name: core
description: Core agent-cdp usage guide. Read this before running any agent-cdp commands. Covers the daemon lifecycle, target selection, runtime inspection, network inspection, console capture, trace recording, heap snapshot analysis, JS heap monitoring, and CPU profiling workflows. Use when you need to analyze network failures, memory leaks, CPU hotspots, or runtime behavior of a Chrome/Node.js target via Chrome DevTools Protocol.
allowed-tools: Bash(agent-cdp:*)
---

# agent-cdp core

CLI for deep runtime analysis of Chrome and Node.js processes via Chrome
DevTools Protocol (CDP). Captures heap snapshots, CPU profiles, JS memory
samples, network traffic, console output, live runtime values, and performance traces — all without modifying source code.

## The core loop

```bash
agent-cdp start                             # 1. Start the background daemon
agent-cdp target list --url URL             # 2. List inspectable targets
agent-cdp target select <id> --url URL      # 3. Pick a target to attach to
agent-cdp <capture-command>                 # 4. Capture data
agent-cdp <analysis-command>                # 5. Analyze captured data
```

The daemon runs as a background process and maintains the CDP connection.
All capture and analysis commands communicate with it via IPC.

## Daemon management

```bash
agent-cdp start          # start daemon (idempotent — safe to call if already running)
agent-cdp stop           # stop daemon
agent-cdp status         # show daemon status, active target, active connections
```

Always start the daemon before any other commands. `start` is idempotent.

## Target selection

A "target" is a Chrome tab or Node.js process exposing a CDP endpoint.

```bash
agent-cdp target list                                  # scan default local CDP URLs (9222, 9229, 8081)
agent-cdp target list --url http://localhost:9229      # list targets for a Node.js process
agent-cdp target list --url http://localhost:9222      # list targets for Chrome
agent-cdp target list --url http://localhost:8081      # list targets for React Native (Metro)
agent-cdp target select <id>                           # select a specific target using the URL encoded in the id
agent-cdp target select <id> --url URL                 # optional URL consistency check
agent-cdp target clear                                 # deselect the current target
```

The `--url` flag is the CDP discovery URL (the `--inspect` address for Node.js,
or Chrome's remote debugging port). When omitted, `target list` scans the local
default URLs and encodes the discovery URL into each target id. After
`target select`, subsequent commands use that target automatically.

### React Native

React Native apps expose a CDP endpoint through the Metro bundler on port 8081.

```bash
agent-cdp target list --url http://localhost:8081
agent-cdp target select <id>
```

Requirements:
- The Metro bundler must be running (`npx react-native start` or `expo start`)
- The app must be running in debug mode on a simulator/emulator or physical device
- For physical devices, forward the port first: `adb reverse tcp:8081 tcp:8081`

Metro exposes multiple targets (JS runtime, Hermes debugger, etc.). Pick the
one labelled with your app name or `"React Native"` in the target list.

## Console capture

```bash
agent-cdp console list [--limit N]     # show recent console messages (default 50)
agent-cdp console get <id>             # get full details of a specific message
```

Console messages are collected while the daemon is running with an active target.

## Runtime inspection

For Runtime workflows, run:

```bash
agent-cdp skills get runtime
```

That skill covers expression evaluation, object handle inspection, and release guidance for preserved Runtime objects.

## Network inspection

For network workflows, run:

```bash
agent-cdp skills get network
```

That skill contains session behavior, common workflows, body inspection guidance, and network-specific troubleshooting.

## Trace recording

For trace workflows, run:

```bash
agent-cdp skills get trace
```

That skill contains trace session behavior, user-timing/custom-track inspection, token-efficient navigation guidance, and raw export guidance.

Minimal commands:

```bash
agent-cdp trace start                       # begin recording a performance trace
agent-cdp trace stop [--file PATH]          # stop, analyze in memory, and optionally export the raw trace
agent-cdp trace summary
agent-cdp trace tracks
agent-cdp trace entries
```

Use `--file PATH` only when you need the raw trace JSON for direct inspection or external tools.

## Heap snapshot analysis

The heap snapshot workflow captures a V8 heap snapshot and lets you inspect
retained objects, find memory leaks, and compare snapshots.

```bash
# Capture
agent-cdp memory snapshot capture [--name NAME] [--gc] [--file PATH]
agent-cdp memory snapshot load --file PATH [--name NAME]   # load an existing .heapsnapshot

# List and summarize
agent-cdp memory snapshot list
agent-cdp memory snapshot summary [--snapshot ID]

# Inspect classes and objects
agent-cdp memory snapshot classes [--snapshot ID] [--limit N] [--offset N] [--sort retained|self|count] [--filter TEXT]
agent-cdp memory snapshot class --id CLASS_ID [--snapshot ID]
agent-cdp memory snapshot instances --class CLASS_ID [--snapshot ID] [--limit N] [--offset N] [--sort retained|self]
agent-cdp memory snapshot instance --id NODE_ID [--snapshot ID]
agent-cdp memory snapshot retainers --id NODE_ID [--snapshot ID] [--depth N] [--limit N]

# Leak detection
agent-cdp memory snapshot diff --base SNAPSHOT_ID --compare SNAPSHOT_ID [--sort retained|self|count] [--limit N]
agent-cdp memory snapshot leak-candidates [--snapshot ID] [--limit N]
agent-cdp memory snapshot leak-triplet --baseline ID --action ID --cleanup ID [--limit N]
```

### Memory leak detection workflow

```bash
# 1. Baseline
agent-cdp memory snapshot capture --name baseline --gc
# 2. Trigger the leaky action in the app
# 3. Capture again
agent-cdp memory snapshot capture --name after-action --gc
# 4. Clean up (GC, reset state)
# 5. Final capture
agent-cdp memory snapshot capture --name cleanup --gc
# 6. Diff to find what grew
agent-cdp memory snapshot diff --base 1 --compare 2 --sort retained
# 7. Three-snapshot leak analysis
agent-cdp memory snapshot leak-triplet --baseline 1 --action 2 --cleanup 3
```

Use `--gc` before capturing to force a garbage collection so only truly
retained objects appear in the snapshot.

## JS heap usage monitor

Lightweight heap usage sampling — faster than full snapshots.

```bash
agent-cdp memory usage sample [--label LABEL] [--gc]    # take a heap usage sample
agent-cdp memory usage list [--limit N] [--offset N]    # list all samples
agent-cdp memory usage summary                           # overall stats
agent-cdp memory usage diff --base SAMPLE_ID --compare SAMPLE_ID
agent-cdp memory usage trend [--limit N]                 # usage over time
agent-cdp memory usage leak-signal                       # heuristic leak indicator
```

Use `memory usage` for quick "is heap growing?" checks. Use `memory snapshot` for
deep object-level analysis.

## JS allocation profiler

Sampled allocation timeline summary. Use this to find which callsites are
driving allocation pressure over the lifetime of an interaction without feeding
the raw sampling profile to the LLM by default.

```bash
# Record
agent-cdp memory allocation start [--name NAME] [--interval BYTES] [--stack-depth N] [--include-major-gc] [--include-minor-gc]
# ... run the workload you suspect is leaking ...
agent-cdp memory allocation stop

# Inspect
agent-cdp memory allocation status
agent-cdp memory allocation list [--limit N] [--offset N]
agent-cdp memory allocation summary [--session ID]
agent-cdp memory allocation hotspots [--session ID] [--limit N] [--offset N] [--sort bytes|samples]
agent-cdp memory allocation bucketed [--session ID] [--limit N]
agent-cdp memory allocation leak-signal [--session ID]
agent-cdp memory allocation export --file PATH [--session ID]
```

Use `memory allocation` when you need a compact leak-oriented summary of allocation
pressure. Use `memory snapshot` when you need proof that objects are still retained
after cleanup.

## JS allocation timeline

DevTools-style "Allocations on timeline" workflow. This records live heap object
tracking over time and ends with a final heap snapshot that includes allocation
trace data.

```bash
# Record
agent-cdp memory allocation-timeline start [--name NAME]
# ... run the leaking interaction ...
agent-cdp memory allocation-timeline stop

# Inspect
agent-cdp memory allocation-timeline status
agent-cdp memory allocation-timeline list [--limit N] [--offset N]
agent-cdp memory allocation-timeline summary [--session ID]
agent-cdp memory allocation-timeline buckets [--session ID] [--limit N]
agent-cdp memory allocation-timeline hotspots [--session ID] [--limit N] [--offset N]
agent-cdp memory allocation-timeline leak-signal [--session ID]
agent-cdp memory allocation-timeline export --file PATH [--session ID]
```

Use `memory allocation-timeline` when you need a heavier-weight timeline capture
that tracks heap growth during the interaction and ties the result to a final
heap snapshot with allocation traces.

## JS CPU profiler

Sampling CPU profiler with source-map support.

```bash
# Record
agent-cdp profile cpu start [--name NAME] [--interval US]   # start profiling (default 100µs interval)
# ... run the workload ...
agent-cdp profile cpu stop                                   # stop and save

# Inspect
agent-cdp profile cpu status                                 # check if recording
agent-cdp profile cpu list [--limit N] [--offset N]         # list sessions
agent-cdp profile cpu summary [--session ID]                 # top-level stats
agent-cdp profile cpu hotspots [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs] [--min-self-ms N] [--include-runtime]
agent-cdp profile cpu hotspot --id HOTSPOT_ID [--session ID] [--stack-limit N]
agent-cdp profile cpu modules [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs]
agent-cdp profile cpu stacks [--session ID] [--limit N] [--offset N] [--min-ms N] [--max-depth N]
agent-cdp profile cpu slice --start MS --end MS [--session ID] [--limit N]
agent-cdp profile cpu diff --base SESSION_ID --compare SESSION_ID [--limit N] [--min-delta-pct N]
agent-cdp profile cpu export [--session ID]
agent-cdp profile cpu source-maps [--session ID]
```

### CPU profiling workflow

```bash
agent-cdp profile cpu start --name before-optimization
# ... run the workload you want to profile ...
agent-cdp profile cpu stop
agent-cdp profile cpu hotspots --sort selfMs --limit 20
agent-cdp profile cpu hotspot --id <HOTSPOT_ID>    # drill into a specific hotspot
```

`--interval US` sets the sampling interval in microseconds (default 100).
Lower values give finer resolution but more overhead.

## Common flags

```bash
--url URL        # CDP discovery URL for target listing/selection
--limit N        # limit result count
--offset N       # pagination offset
--sort FIELD     # sort order (command-specific values)
--file PATH      # file path for input/output
--name NAME      # human-readable label for a capture
--gc             # force garbage collection before capture
--session ID     # specify which profiler session to analyze
--snapshot ID    # specify which heap snapshot to analyze
```

## Troubleshooting

**"No active target"**
Run `agent-cdp target list --url URL` then `agent-cdp target select <id> --url URL`.

**"Daemon is not running"**
Run `agent-cdp start` first.

**"Failed to connect"**
Check that the target process is running with CDP enabled:
- Node.js: started with `--inspect` or `--inspect-brk`
- Chrome: started with `--remote-debugging-port=9222`
- React Native: Metro bundler running on port 8081; app open in debug mode; for physical devices, run `adb reverse tcp:8081 tcp:8081` first

**Snapshot IDs vs names**
Commands that take `--snapshot ID` or `--session ID` expect the numeric ID
shown in `list` output, not the human-readable name.

**Source maps not resolving**
Run `agent-cdp profile cpu source-maps [--session ID]` to check which source
maps were found. Source maps must be accessible at the paths referenced in
the profile.
