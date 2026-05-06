export function usage(): string {
  return `Usage: agent-cdp <command>

If you are an LLM agent, run 'agent-cdp skills get core' before using this
tool. The skill file contains workflows, flag reference, and troubleshooting
guidance optimized for automated use.

Daemon:
  start     Start daemon
  stop      Stop daemon
  status    Show daemon status

Targets:
  target list [--url URL]
  target select <id> [--url URL]
  target clear

Console:
  console list [--limit N]
  console get <id>

Runtime:
  runtime eval --expr EXPR [--await] [--json]
  runtime props --id OBJECT_ID [--own] [--accessor-properties-only]
  runtime release --id OBJECT_ID
  runtime release-group [--group NAME]

Network:
  network status
  network start [--name NAME] [--preserve-across-navigation]
  network stop
  network sessions [--limit N] [--offset N]
  network summary [--session ID]
  network list [--session ID] [--limit N] [--offset N] [--type TYPE] [--status STATUS] [--method METHOD] [--text TEXT] [--min-ms N] [--max-ms N] [--min-bytes N] [--max-bytes N]
  network request --id REQ_ID [--session ID]
  network request-headers --id REQ_ID [--session ID] [--name TEXT]
  network response-headers --id REQ_ID [--session ID] [--name TEXT]
  network request-body --id REQ_ID [--session ID] [--file PATH]
  network response-body --id REQ_ID [--session ID] [--file PATH]

Trace:
  trace start
  trace stop [--file PATH]
  trace status
  trace list [--limit N] [--offset N]
  trace summary [--session ID]
  trace tracks [--session ID] [--limit N] [--offset N] [--text TEXT] [--group NAME]
  trace entries [--session ID] [--track NAME] [--type measure|mark|stamp] [--text TEXT] [--start-ms N] [--end-ms N] [--limit N] [--offset N] [--sort time|duration|name]
  trace entry --id ENTRY_ID [--session ID]

Memory (raw capture):
  memory capture --file PATH

Heap Snapshot Analyzer:
  mem-snapshot capture [--name NAME] [--gc] [--file PATH]
  mem-snapshot load --file PATH [--name NAME]
  mem-snapshot list
  mem-snapshot summary [--snapshot ID]
  mem-snapshot classes [--snapshot ID] [--limit N] [--offset N] [--sort retained|self|count] [--filter TEXT]
  mem-snapshot class --id CLASS_ID [--snapshot ID]
  mem-snapshot instances --class CLASS_ID [--snapshot ID] [--limit N] [--offset N] [--sort retained|self]
  mem-snapshot instance --id NODE_ID [--snapshot ID]
  mem-snapshot retainers --id NODE_ID [--snapshot ID] [--depth N] [--limit N]
  mem-snapshot diff --base SNAPSHOT_ID --compare SNAPSHOT_ID [--sort retained|self|count] [--limit N]
  mem-snapshot leak-triplet --baseline ID --action ID --cleanup ID [--limit N]
  mem-snapshot leak-candidates [--snapshot ID] [--limit N]

JS Heap Usage Monitor:
  js-memory sample [--label LABEL] [--gc]
  js-memory list [--limit N] [--offset N]
  js-memory summary
  js-memory diff --base SAMPLE_ID --compare SAMPLE_ID
  js-memory trend [--limit N]
  js-memory leak-signal

JS Allocation Profiler:
  js-allocation start [--name NAME] [--interval BYTES] [--stack-depth N] [--include-major-gc] [--include-minor-gc]
  js-allocation stop
  js-allocation status
  js-allocation list [--limit N] [--offset N]
  js-allocation summary [--session ID]
  js-allocation hotspots [--session ID] [--limit N] [--offset N] [--sort bytes|samples]
  js-allocation bucketed [--session ID] [--limit N]
  js-allocation leak-signal [--session ID]
  js-allocation export --file PATH [--session ID]
  js-allocation source-maps [--session ID]

JS Allocation Timeline:
  js-allocation-timeline start [--name NAME]
  js-allocation-timeline stop
  js-allocation-timeline status
  js-allocation-timeline list [--limit N] [--offset N]
  js-allocation-timeline summary [--session ID]
  js-allocation-timeline buckets [--session ID] [--limit N]
  js-allocation-timeline hotspots [--session ID] [--limit N] [--offset N]
  js-allocation-timeline leak-signal [--session ID]
  js-allocation-timeline export --file PATH [--session ID]
  js-allocation-timeline source-maps [--session ID]
  After stop, use snapshot id with: mem-snapshot summary|classes|retainers --snapshot ms_N

JS Profiler:
  js-profile start [--name NAME] [--interval US]
  js-profile stop
  js-profile status
  js-profile list [--limit N] [--offset N]
  js-profile summary [--session ID]
  js-profile hotspots [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs] [--min-self-ms N] [--include-runtime]
  js-profile hotspot --id HOTSPOT_ID [--session ID] [--stack-limit N]
  js-profile modules [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs]
  js-profile stacks [--session ID] [--limit N] [--offset N] [--min-ms N] [--max-depth N]
  js-profile slice --start MS --end MS [--session ID] [--limit N]
  js-profile diff --base SESSION_ID --compare SESSION_ID [--limit N] [--min-delta-pct N]
  js-profile export [--session ID]
  js-profile source-maps [--session ID]

Skills:
  skills list             List available skill files
  skills get <name>       Print a skill file (e.g. 'skills get core')

Global:
  --verbose               Richer output (symbolicated paths, source-map stats, extra detail)`;
}
