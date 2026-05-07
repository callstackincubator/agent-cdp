export function usage(): string {
  return `Usage: agent-cdp <command>

If you are an LLM agent, run 'agent-cdp skills get core' before using this
tool. The skill file contains workflows, flag reference, and troubleshooting
guidance optimized for automated use.

Top-level commands:
  start                  Start daemon
  stop                   Stop daemon
  status                 Show daemon status
  target                 Target selection commands
  console                Console capture commands
  runtime                Runtime inspection commands
  network                Network inspection commands
  trace                  Trace commands
  memory                 Memory inspection commands
  profile                Profiling commands
  skills                 Read bundled skills

Examples:
  agent-cdp target list [--url URL]
  agent-cdp runtime eval --expr EXPR [--await] [--json]
  agent-cdp network list [--session ID] [--limit N] [--offset N]
  agent-cdp trace summary [--session ID]
  agent-cdp memory snapshot capture [--name NAME] [--gc] [--file PATH]
  agent-cdp memory usage summary
  agent-cdp memory allocation hotspots [--session ID] [--limit N] [--offset N]
  agent-cdp memory allocation-timeline summary [--session ID]
  agent-cdp profile cpu hotspots [--session ID] [--limit N] [--offset N]

Run subgroup help for full syntax:
  agent-cdp memory --help
  agent-cdp memory snapshot --help
  agent-cdp memory usage --help
  agent-cdp memory allocation --help
  agent-cdp memory allocation-timeline --help
  agent-cdp profile cpu --help

Skills:
  skills list             List available skill files
  skills get <name>       Print a skill file (e.g. 'skills get core')

Global:
  --verbose               Richer output (symbolicated paths, source-map stats, extra detail)`;
}
