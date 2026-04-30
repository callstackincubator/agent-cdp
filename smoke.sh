#!/usr/bin/env bash

set -u -o pipefail

RN_URL="${RN_URL:-http://127.0.0.1:8081}"
TRACE_FILE="${TRACE_FILE:-./smoke-trace.json}"
HEAP_FILE="${HEAP_FILE:-./smoke.heapsnapshot}"

LAST_OUTPUT=""
FAILURES=0

run_cmd() {
  local cmd="$1"
  local output
  local status

  printf '$ %s\n' "$cmd"
  output=$(eval "$cmd" 2>&1)
  status=$?

  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  fi

  printf '[exit %s]\n\n' "$status"

  LAST_OUTPUT="$output"
  if [ "$status" -ne 0 ]; then
    FAILURES=$((FAILURES + 1))
  fi

  return "$status"
}

extract_target_id() {
  local line

  while IFS= read -r line; do
    case "$line" in
      "" | "  "*)
        ;;
      *)
        printf '%s' "$line"
        return 0
        ;;
    esac
  done <<< "$LAST_OUTPUT"

  return 1
}

run_cmd "pnpm run build"
run_cmd "pnpm run --silent agent-cdp -- start"
run_cmd "pnpm run --silent agent-cdp -- status"
run_cmd "pnpm run --silent agent-cdp -- target list --react-native-url $RN_URL"

TARGET_ID=""
if TARGET_ID=$(extract_target_id); then
  run_cmd "pnpm run --silent agent-cdp -- target select \"$TARGET_ID\" --react-native-url $RN_URL"
  run_cmd "pnpm run --silent agent-cdp -- console list --limit 20"
  run_cmd "pnpm run --silent agent-cdp -- trace start"
  run_cmd "pnpm run --silent agent-cdp -- trace stop --file $TRACE_FILE"
  run_cmd "pnpm run --silent agent-cdp -- memory capture --file $HEAP_FILE"
  run_cmd "pnpm run --silent agent-cdp -- target clear"
else
  printf 'No React Native target found at %s\n\n' "$RN_URL"
  FAILURES=$((FAILURES + 1))
fi

run_cmd "pnpm run --silent agent-cdp -- stop"

if [ "$FAILURES" -ne 0 ]; then
  printf 'Smoke run finished with %s failure(s).\n' "$FAILURES"
  exit 1
fi

printf 'Smoke run finished successfully.\n'
