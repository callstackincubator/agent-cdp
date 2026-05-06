#!/usr/bin/env bash

set -u -o pipefail

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

extract_object_id() {
  local line

  while IFS= read -r line; do
    case "$line" in
      objectId:\ *)
        printf '%s' "${line#objectId: }"
        return 0
        ;;
    esac
  done <<< "$LAST_OUTPUT"

  return 1
}

run_cmd "pnpm run --silent agent-cdp -- start"
run_cmd "pnpm run --silent agent-cdp -- status"

run_cmd "pnpm run --silent agent-cdp -- runtime eval --expr '1 + 2'"
run_cmd "pnpm run --silent agent-cdp -- runtime eval --await --expr 'Promise.resolve(42)'"

case "$LAST_OUTPUT" in
  *"number: 42"*)
    ;;
  *"Promise"*)
    printf 'Async runtime eval returned a promise instead of the resolved value\n\n'
    FAILURES=$((FAILURES + 1))
    ;;
  *)
    printf 'Async runtime eval did not return the expected resolved value\n\n'
    FAILURES=$((FAILURES + 1))
    ;;
esac

run_cmd "pnpm run --silent agent-cdp -- runtime eval --json --expr '({ title: \"runtime demo\", count: 3, nested: { ready: true }, list: [1, 2, 3] })'"
run_cmd "pnpm run --silent agent-cdp -- runtime eval --expr 'globalThis.__agentCdpRuntimeDemo = { title: \"runtime demo\", count: 3, nested: { ready: true }, list: [1, 2, 3] }; globalThis.__agentCdpRuntimeDemo'"

OBJECT_ID=""
if OBJECT_ID=$(extract_object_id); then
  run_cmd "pnpm run --silent agent-cdp -- runtime props --id \"$OBJECT_ID\" --own"
  run_cmd "pnpm run --silent agent-cdp -- runtime release --id \"$OBJECT_ID\""
else
  printf 'No runtime object id found in eval output\n\n'
  FAILURES=$((FAILURES + 1))
fi

run_cmd "pnpm run --silent agent-cdp -- runtime release-group"

run_cmd "pnpm run --silent agent-cdp -- stop"

if [ "$FAILURES" -ne 0 ]; then
  printf 'Runtime demo finished with %s failure(s).\n' "$FAILURES"
  exit 1
fi

printf 'Runtime demo finished successfully.\n'
