---
name: network
description: Network inspection workflows for agent-cdp. Use after reading the core skill and selecting a target. Covers session lifecycle, failed-request triage, body inspection, binary export, and practical guidance for agent-friendly network debugging.
allowed-tools: Bash(agent-cdp:*)
---

# agent-cdp network

Focused guide for network capture and inspection after the daemon is running and a target has been selected.

Prerequisite:

```bash
agent-cdp skills get core
agent-cdp start
agent-cdp target list --url URL
agent-cdp target select <id> --url URL
```

## Mental model

- After `target select`, the daemon starts an initial active network session automatically.
- That initial session appears in `network sessions` and can be stopped with `network stop`.
- `network start` creates a fresh empty session and does not backfill earlier requests.
- Only one active network session exists at a time.
- Without `--session`, queries prefer the active session, then the latest stored session, then the live rolling buffer if no session exists.
- The live buffer keeps only the most recent `200` requests.

## Commands

```bash
agent-cdp network status

agent-cdp network start [--name NAME] [--preserve-across-navigation]
agent-cdp network stop
agent-cdp network sessions [--limit N] [--offset N]

agent-cdp network summary [--session ID]
agent-cdp network list [--session ID] [--limit N] [--offset N] [--type TYPE] [--status STATUS] [--method METHOD] [--text TEXT] [--min-ms N] [--max-ms N] [--min-bytes N] [--max-bytes N]
agent-cdp network request --id REQ_ID [--session ID]
agent-cdp network request-headers --id REQ_ID [--session ID] [--name TEXT]
agent-cdp network response-headers --id REQ_ID [--session ID] [--name TEXT]
agent-cdp network request-body --id REQ_ID [--session ID] [--file PATH]
agent-cdp network response-body --id REQ_ID [--session ID] [--file PATH]
```

## Workflow: Quick Triage

Use this when you want a fast overview of an interaction.

```bash
agent-cdp network summary
agent-cdp network list --status failed
agent-cdp network list --min-ms 1000
```

What to look for:
- failed requests
- slow requests
- unusually large responses
- request type concentration such as repeated `xhr` or `fetch`

## Workflow: Capture A Repro In A Fresh Session

Use this when you want a clean session for a specific bug reproduction.

```bash
agent-cdp network stop
agent-cdp network start --name login-repro --preserve-across-navigation
# reproduce the issue in the app
agent-cdp network stop
agent-cdp network sessions
agent-cdp network summary --session net_2
```

Notes:
- Stop the current session first if one is already active.
- Use `--preserve-across-navigation` when the repro crosses page loads or full-document navigations.

## Workflow: Investigate A Failed Request

```bash
agent-cdp network list --status failed
agent-cdp network request --id req_12
agent-cdp network request-headers --id req_12
agent-cdp network response-headers --id req_12
agent-cdp network response-body --id req_12
```

Typical checks:
- request URL and method are correct
- auth, cookie, and content-type headers are present
- response status and headers match expectations
- response body contains server-side error details

## Workflow: Inspect JSON APIs

```bash
agent-cdp network list --type fetch --text /api/
agent-cdp network request --id req_12
agent-cdp network request-body --id req_12
agent-cdp network response-body --id req_12
```

Body handling behavior:
- Text-like content types are decoded to text when CDP returns them as base64.
- Binary content types remain base64 in terminal output.
- JSON is currently shown as raw text, not pretty-printed.

## Workflow: Export Binary Or Large Bodies

Use file export for images, downloads, large payloads, or anything you do not want inline in the terminal.

```bash
agent-cdp network response-body --id req_12 --file ./response.bin
agent-cdp network request-body --id req_12 --file ./request.bin
```

Use `--file` when:
- the content type is binary
- the body is large
- you want exact bytes instead of terminal rendering

## Workflow: Search By Endpoint, Method, Or Payload Size

```bash
agent-cdp network list --text checkout
agent-cdp network list --method POST
agent-cdp network list --status 5xx
agent-cdp network list --min-bytes 1000000
agent-cdp network list --min-ms 500 --max-ms 5000
```

This is useful for narrowing the session before drilling into a specific request id.

## Body Caveats

- `network request` intentionally omits headers and bodies; use the explicit follow-up commands.
- Request bodies depend on target support for `Network.getRequestPostData`.
- Multipart form-data is not parsed into fields. CDP returns multipart request body text without files when available.
- Response and request bodies may be unavailable after disconnects or on targets with partial CDP support.
- Binary response bodies are best exported with `--file`.

## Target Compatibility

- CDP `Network.*` support varies by runtime and target.
- There is no runtime-specific fallback instrumentation in v1.
- WebSocket support is handshake-only in v1.
- No HAR export, request blocking, throttling, mocking, replay, or redaction is included in v1.

## Suggested Agent Loop

When debugging a network issue, prefer this order:

```bash
agent-cdp network summary
agent-cdp network list --status failed
agent-cdp network list --min-ms 1000
agent-cdp network request --id REQ_ID
agent-cdp network request-headers --id REQ_ID
agent-cdp network response-headers --id REQ_ID
agent-cdp network response-body --id REQ_ID
```

If the issue is noisy or mixed with unrelated traffic, start a fresh named session and reproduce again.
