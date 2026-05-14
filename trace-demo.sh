#!/usr/bin/env bash

set -euo pipefail

TRACE_FILE="${TRACE_FILE:-/tmp/agent-cdp-trace-$(date +%s).json}"
STOPPED=0

print_section() {
  printf '\n== %s ==\n' "$1"
}

run_cmd() {
  printf '+ %s\n' "$*"
  "$@"
}

show_latest_entry() {
  local first_line entry_id

  first_line="$(pnpm agent-cdp trace entries --limit 1 2>/dev/null || true)"
  if [[ -z "$first_line" ]]; then
    return
  fi

  IFS=' ' read -r entry_id _ <<< "$first_line"
  if [[ -n "$entry_id" && "$entry_id" != "No" ]]; then
    print_section "trace entry --id $entry_id"
    run_cmd pnpm agent-cdp trace entry --id "$entry_id"
  fi
}

cleanup() {
  if [[ "$STOPPED" -eq 1 ]]; then
    return
  fi
  STOPPED=1

  print_section "Stopping trace"
  run_cmd pnpm agent-cdp trace stop --file "$TRACE_FILE"

  print_section "trace status"
  run_cmd pnpm agent-cdp trace status

  print_section "trace list"
  run_cmd pnpm agent-cdp trace list

  print_section "trace summary"
  run_cmd pnpm agent-cdp trace summary

  print_section "trace tracks"
  run_cmd pnpm agent-cdp trace tracks

  print_section "trace entries"
  run_cmd pnpm agent-cdp trace entries

  show_latest_entry

  print_section "Raw trace file"
  printf '%s\n' "$TRACE_FILE"
}

trap cleanup INT TERM

print_section "Starting trace"
run_cmd pnpm agent-cdp trace start

printf '\nTrace is running. Press Ctrl+C to stop and inspect the latest session.\n'

while true; do
  sleep 1
done
