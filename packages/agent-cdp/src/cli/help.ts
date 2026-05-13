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

Memory Snapshot:
  memory snapshot capture [--name NAME] [--gc] [--file PATH]
  memory snapshot load --file PATH [--name NAME]
  memory snapshot list
  memory snapshot summary [--snapshot ID]
  memory snapshot classes [--snapshot ID] [--limit N] [--offset N] [--sort retained|self|count] [--filter TEXT]
  memory snapshot class --id CLASS_ID [--snapshot ID]
  memory snapshot instances --class CLASS_ID [--snapshot ID] [--limit N] [--offset N] [--sort retained|self]
  memory snapshot instance --id NODE_ID [--snapshot ID]
  memory snapshot retainers --id NODE_ID [--snapshot ID] [--depth N] [--limit N]
  memory snapshot diff --base SNAPSHOT_ID --compare SNAPSHOT_ID [--sort retained|self|count] [--limit N]
  memory snapshot leak-triplet --baseline ID --action ID --cleanup ID [--limit N]
  memory snapshot leak-candidates [--snapshot ID] [--limit N]

Memory Usage:
  memory usage sample [--label LABEL] [--gc]
  memory usage list [--limit N] [--offset N]
  memory usage summary
  memory usage diff --base SAMPLE_ID --compare SAMPLE_ID
  memory usage trend [--limit N]
  memory usage leak-signal [--since SAMPLE_ID]

Memory Allocation:
  memory allocation start [--name NAME] [--interval BYTES] [--stack-depth N] [--include-major-gc] [--include-minor-gc]
  memory allocation stop
  memory allocation status
  memory allocation list [--limit N] [--offset N]
  memory allocation summary [--session ID]
  memory allocation hotspots [--session ID] [--limit N] [--offset N] [--sort bytes|samples]
  memory allocation bucketed [--session ID] [--limit N]
  memory allocation leak-signal [--session ID]
  memory allocation export --file PATH [--session ID]
  memory allocation source-maps [--session ID]

Memory Allocation Timeline:
  memory allocation-timeline start [--name NAME]
  memory allocation-timeline stop
  memory allocation-timeline status
  memory allocation-timeline list [--limit N] [--offset N]
  memory allocation-timeline summary [--session ID]
  memory allocation-timeline buckets [--session ID] [--limit N]
  memory allocation-timeline hotspots [--session ID] [--limit N] [--offset N]
  memory allocation-timeline leak-signal [--session ID]
  memory allocation-timeline export --file PATH [--session ID]
  memory allocation-timeline source-maps [--session ID]
  After stop, use snapshot id with: memory snapshot summary|classes|retainers --snapshot ms_N

CPU Profiling:
  profile cpu start [--name NAME] [--interval US]
  profile cpu stop
  profile cpu status
  profile cpu list [--limit N] [--offset N]
  profile cpu summary [--session ID]
  profile cpu hotspots [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs] [--min-self-ms N] [--min-total-ms N] [--include-runtime]
  profile cpu hotspot --id HOTSPOT_ID [--session ID] [--stack-limit N]
  profile cpu modules [--session ID] [--limit N] [--offset N] [--sort selfMs|totalMs]
  profile cpu stacks [--session ID] [--limit N] [--offset N] [--min-ms N] [--max-depth N]
  profile cpu slice --start MS --end MS [--session ID] [--limit N]
  profile cpu diff --base SESSION_ID --compare SESSION_ID [--limit N] [--min-delta-pct N]
  profile cpu export [--session ID]
  profile cpu source-maps [--session ID]

Skills:
  skills list             List available skill files
  skills get <name>       Print a skill file (e.g. 'skills get core')

Global:
  --verbose               Richer output (symbolicated paths, source-map stats, extra detail)`;
}
