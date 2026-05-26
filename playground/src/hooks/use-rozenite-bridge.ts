import { useState } from 'react';

import { useRozeniteInAppAgentTool } from '@rozenite/agent-bridge';

export type RozeniteBridgeState = {
  lastCall: { name: string; result: unknown; ts: number } | null;
};

const echoTool = {
  name: 'echo',
  description: 'Returns the provided text argument unchanged',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Text to echo back' } },
    required: ['text'],
  },
};

const getTimestampTool = {
  name: 'getTimestamp',
  description: 'Returns the current device date/time as an ISO string',
  inputSchema: { type: 'object', properties: {} },
};

const getPlaygroundInfoTool = {
  name: 'getPlaygroundInfo',
  description: 'Returns basic information about the playground runtime environment',
  inputSchema: { type: 'object', properties: {} },
};

// Total number of test tools registered by useRozeniteBridge
export const ROZENITE_TOOL_COUNT = 3;

export function useRozeniteBridge(): RozeniteBridgeState {
  const [lastCall, setLastCall] = useState<RozeniteBridgeState['lastCall']>(null);

  useRozeniteInAppAgentTool({
    tool: echoTool,
    handler: (args: { text?: string }) => {
      const result = { echo: args?.text ?? '' };
      setLastCall({ name: 'app.echo', result, ts: Date.now() });
      return result;
    },
  });

  useRozeniteInAppAgentTool({
    tool: getTimestampTool,
    handler: () => {
      const result = { timestamp: new Date().toISOString() };
      setLastCall({ name: 'app.getTimestamp', result, ts: Date.now() });
      return result;
    },
  });

  useRozeniteInAppAgentTool({
    tool: getPlaygroundInfoTool,
    handler: () => {
      const result = {
        hermes: typeof (globalThis as Record<string, unknown>).HermesInternal !== 'undefined',
        now: Date.now(),
      };
      setLastCall({ name: 'app.getPlaygroundInfo', result, ts: Date.now() });
      return result;
    },
  });

  return { lastCall };
}