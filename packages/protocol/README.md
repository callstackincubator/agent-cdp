# @agent-cdp/protocol

`@agent-cdp/protocol` contains the shared TypeScript types and command contracts used by the `agent-cdp` CLI, daemon, and runtime SDK bridge.

## Install

```sh
npm install @agent-cdp/protocol
```

For workspace development from this repository:

```sh
pnpm install
pnpm run build
```

## What it exports

- Discovery and target types such as `TargetDescriptor`, `StatusInfo`, and `DaemonInfo`
- IPC command and response unions such as `IpcCommand` and `IpcResponse`
- Runtime bridge request and response types such as `AgentRuntimeBridgeRequest` and `AgentRuntimeBridgeResponse`
- Shared binding names used by the runtime bridge: `AGENT_CDP_BINDING_NAME` and `AGENT_CDP_RECEIVE_NAME`

## Usage

```ts
import type { AgentRuntimeBridgeRequest, TargetDescriptor } from "@agent-cdp/protocol";
import { AGENT_CDP_BINDING_NAME } from "@agent-cdp/protocol";

const request: AgentRuntimeBridgeRequest = {
  id: "1",
  command: { type: "js-profile-status" },
};

function describeTarget(target: TargetDescriptor) {
  return `${target.kind}:${target.title}`;
}

console.log(AGENT_CDP_BINDING_NAME, request, describeTarget);
```
