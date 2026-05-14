import { cpuProfile, type JsProfileStatusResponse } from '@agent-cdp/sdk';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { runAsyncBurst } from '@/scenarios/profile-async';
import { runCpuHotspot } from '@/scenarios/profile-cpu';

type RetainedSample = {
  id: string;
  label: string;
  payload: string;
  values: number[];
  nested: {
    checksum: number;
    createdAt: string;
    tags: string[];
  };
};

type RetainedBatch = {
  id: string;
  createdAt: string;
  samples: RetainedSample[];
};

type RuntimeState = {
  batches: RetainedBatch[];
};

const runtimeState = globalThis as typeof globalThis & {
  __agentCdpPlayground?: RuntimeState;
};

function getStore() {
  if (!runtimeState.__agentCdpPlayground) {
    runtimeState.__agentCdpPlayground = { batches: [] };
  }

  return runtimeState.__agentCdpPlayground;
}

function createRetainedBatch(prefix: string, size: number) {
  const batchId = `${prefix}-${Date.now()}`;
  const samples = Array.from({ length: size }, (_, index) => ({
    id: `${batchId}-${index}`,
    label: `${prefix} sample ${index}`,
    payload: `${prefix}-${index}`.repeat(8),
    values: Array.from({ length: 32 }, (__, valueIndex) => index * (valueIndex + 1)),
    nested: {
      checksum: index * 17,
      createdAt: new Date().toISOString(),
      tags: [`${prefix}-tag`, `group-${index % 10}`, `bucket-${index % 25}`],
    },
  }));

  return {
    id: batchId,
    createdAt: new Date().toISOString(),
    samples,
  } satisfies RetainedBatch;
}

function triggerTransientChurn() {
  let checksum = 0;

  for (let group = 0; group < 80; group += 1) {
    const temporary = Array.from({ length: 400 }, (_, index) => ({
      id: `${group}-${index}`,
      bytes: `${group}-${index}`.repeat(12),
      score: group * index,
    }));

    checksum += temporary.reduce((total, item) => total + item.score, 0);
  }

  return checksum;
}

function getTotals() {
  const store = getStore();
  const retainedObjectCount = store.batches.reduce((total, batch) => total + batch.samples.length, 0);

  return {
    batchCount: store.batches.length,
    retainedObjectCount,
  };
}

function logState(action: string) {
  const store = getStore();
  const totals = getTotals();
  const latestBatch = store.batches.at(-1);

  console.log('[playground]', action, {
    totals,
    latestBatchId: latestBatch?.id ?? null,
    latestBatchSize: latestBatch?.samples.length ?? 0,
  });
}

function createInspectionPayload() {
  return {
    now: new Date().toISOString(),
    totals: getTotals(),
    latestBatch: getStore().batches.at(-1) ?? null,
  };
}

function markTrace(name: string) {
  if (typeof performance?.mark === 'function') {
    performance.mark(name);
  }
}

function measureTrace(name: string, startMark: string, endMark: string) {
  if (typeof performance?.measure === 'function') {
    performance.measure(name, startMark, endMark);
  }
}

function runSdkCpuWorkload() {
  const seeds = [101, 211, 307, 401];
  const summaries = seeds.map((seed) => runCpuHotspot(seed));

  return {
    iterations: summaries.length,
    checksum: summaries.reduce((total, summary) => total + summary.checksum + summary.peak, 0),
    peak: summaries.reduce((peak, summary) => Math.max(peak, summary.peak), 0),
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    bytes: text.length,
  };
}

function ScenarioButton({
  label,
  onPress,
  variant = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' ? styles.buttonDanger : styles.buttonDefault,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
      testID={label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
      <ThemedText type="smallBold" style={styles.buttonLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [sdkFlowPending, setSdkFlowPending] = useState(false);
  const [sdkFlowMessage, setSdkFlowMessage] = useState('Select the app target with agent-cdp, then run the SDK CPU profile flow.');
  const [sdkFlowError, setSdkFlowError] = useState<string | null>(null);
  const [sdkStatus, setSdkStatus] = useState<JsProfileStatusResponse | null>(null);
  const [lastSdkProfileSessionId, setLastSdkProfileSessionId] = useState<string | null>(null);

  async function refreshSdkCpuProfileStatus() {
    const status = await cpuProfile.status();
    setSdkStatus(status);
    setSdkFlowError(null);
    setSdkFlowMessage('SDK CPU profile status refreshed.');
    return status;
  }

  function retainSmallBatch() {
    const batch = createRetainedBatch('small', 250);
    getStore().batches.push(batch);
    console.log('[playground] retained small batch', batch.id, batch.samples[0]);
    logState('retain-small');
  }

  function retainLargeBatch() {
    const batch = createRetainedBatch('large', 1200);
    getStore().batches.push(batch);
    console.log('[playground] retained large batch', batch.id, batch.samples.at(-1));
    logState('retain-large');
  }

  function clearRetainedBatches() {
    getStore().batches = [];
    console.log('[playground] cleared retained batches');
    logState('clear');
  }

  function createTransientObjects() {
    const checksum = triggerTransientChurn();
    console.log('[playground] transient churn checksum', checksum);
    logState('transient-churn');
  }

  function emitConsoleBurst() {
    const payload = createInspectionPayload();
    console.info('[playground] console info', payload);
    console.warn('[playground] console warn', {
      retainedBatches: payload.totals.batchCount,
      retainedObjects: payload.totals.retainedObjectCount,
    });

    try {
      throw new Error('playground handled error');
    } catch (error) {
      console.error('[playground] console error', error);
    }

    logState('console-burst');
  }

  function runProfileHotspot() {
    const startMark = `cpu-hotspot-start-${Date.now()}`;
    const endMark = `cpu-hotspot-end-${Date.now()}`;
    markTrace(startMark);
    const summary = runCpuHotspot(Date.now());
    markTrace(endMark);
    measureTrace('playground:cpu-hotspot', startMark, endMark);
    console.log('[playground] cpu hotspot summary', summary);
    logState('cpu-hotspot');
  }

  async function runAsyncProfileBurst() {
    const startMark = `async-burst-start-${Date.now()}`;
    markTrace(startMark);
    const summary = await runAsyncBurst(Date.now());
    const endMark = `async-burst-end-${Date.now()}`;
    markTrace(endMark);
    measureTrace('playground:async-burst', startMark, endMark);
    console.log('[playground] async burst summary', summary);
    logState('async-burst');
  }

  async function runSdkCpuProfileFlow() {
    setSdkFlowPending(true);
    setLastSdkProfileSessionId(null);
    setSdkFlowError(null);
    setSdkFlowMessage('Checking current SDK CPU profile status...');

    try {
      const initialStatus = await cpuProfile.status();
      setSdkStatus(initialStatus);

      if (initialStatus.active) {
        const previousSessionId = await cpuProfile.stop();
        console.warn('[playground] stopped existing SDK CPU profile before test flow', {
          previousSessionId,
          initialStatus,
        });
      }

      setSdkFlowMessage('Starting SDK CPU profile...');
      const startResult = await cpuProfile.start({ name: `playground-sdk-${Date.now()}` });
      const activeStatus = await cpuProfile.status();
      setSdkStatus(activeStatus);

      setSdkFlowMessage('Running deterministic JS workload...');
      const startMark = `sdk-cpu-profile-start-${Date.now()}`;
      markTrace(startMark);
      const workload = runSdkCpuWorkload();
      const endMark = `sdk-cpu-profile-end-${Date.now()}`;
      markTrace(endMark);
      measureTrace('playground:sdk-cpu-profile-flow', startMark, endMark);

      setSdkFlowMessage('Stopping SDK CPU profile...');
      const sessionId = await cpuProfile.stop();
      const finalStatus = await cpuProfile.status();
      setSdkStatus(finalStatus);

      setLastSdkProfileSessionId(sessionId);
      setSdkFlowMessage(`Profile captured. Session ID: ${sessionId}`);
      console.log('[playground] SDK CPU profile flow complete', {
        startResult,
        activeStatus,
        workload,
        sessionId,
        finalStatus,
      });
      logState('sdk-cpu-profile-flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSdkFlowError(message);
      setSdkFlowMessage(`SDK CPU profile flow failed: ${message}`);
      console.error('[playground] SDK CPU profile flow failed', error);

      try {
        const status = await cpuProfile.status();
        setSdkStatus(status);
      } catch {
        // Preserve the original failure when status refresh is unavailable.
      }
    } finally {
      setSdkFlowPending(false);
    }
  }

  async function runNetworkBurst() {
    const startMark = `network-burst-start-${Date.now()}`;
    markTrace(startMark);

    const [targetList, missingRoute] = await Promise.all([
      fetchJson('http://127.0.0.1:8081/json/list'),
      fetchJson('http://127.0.0.1:8081/does-not-exist'),
    ]);

    const endMark = `network-burst-end-${Date.now()}`;
    markTrace(endMark);
    measureTrace('playground:network-burst', startMark, endMark);

    console.log('[playground] network burst summary', {
      targetList,
      missingRoute,
    });
    logState('network-burst');
  }

  function logSamplePayload() {
    const payload = createInspectionPayload();

    console.log('[playground] inspection payload', payload);
    logState('log-payload');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <ThemedView style={styles.buttonGroup}>
            <ScenarioButton label="Retain 250 objects" onPress={retainSmallBatch} />
            <ScenarioButton label="Retain 1200 objects" onPress={retainLargeBatch} />
            <ScenarioButton label="Create transient churn" onPress={createTransientObjects} />
            <ScenarioButton label="Emit console burst" onPress={emitConsoleBurst} />
            <ScenarioButton label="Run CPU hotspot" onPress={runProfileHotspot} />
            <ScenarioButton label="Run async burst" onPress={runAsyncProfileBurst} />
            <ScenarioButton
              disabled={sdkFlowPending}
              label={sdkFlowPending ? 'Running SDK CPU profile flow...' : 'Run SDK CPU profile flow'}
              onPress={() => {
                void runSdkCpuProfileFlow();
              }}
            />
            <ScenarioButton
              disabled={sdkFlowPending}
              label="Refresh SDK profile status"
              onPress={() => {
                void refreshSdkCpuProfileStatus();
              }}
            />
            <ScenarioButton label="Run network burst" onPress={runNetworkBurst} />
            <ScenarioButton label="Log inspection payload" onPress={logSamplePayload} />
            <ScenarioButton label="Clear retained batches" onPress={clearRetainedBatches} variant="danger" />
          </ThemedView>
          <ThemedView style={styles.statusCard} type="backgroundElement">
            <ThemedText type="smallBold">SDK CPU Profile E2E</ThemedText>
            <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
              Use this after selecting the Expo target with the daemon. The flow starts profiling, runs a deterministic JS workload, then stops and reports the session.
            </ThemedText>
            <ThemedText type="small">Active: {sdkStatus ? (sdkStatus.active ? 'yes' : 'no') : 'unknown'}</ThemedText>
            <ThemedText type="small">Sessions recorded: {sdkStatus?.sessionCount ?? 'unknown'}</ThemedText>
            <ThemedText type="small">Elapsed ms: {sdkStatus?.elapsedMs ?? 'unknown'}</ThemedText>
            <ThemedText type="small">Active name: {sdkStatus?.activeName ?? 'none'}</ThemedText>
            <ThemedText style={sdkFlowError ? styles.statusError : styles.statusMessage} type="small">
              {sdkFlowMessage}
            </ThemedText>
            {lastSdkProfileSessionId ? (
              <ThemedText selectable style={styles.sessionId} type="code">
                Last session ID: {lastSdkProfileSessionId}
              </ThemedText>
            ) : null}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  scrollView: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: Spacing.four,
  },
  buttonGroup: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  statusCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    minHeight: 40,
    borderWidth: 1,
    justifyContent: 'center',
  },
  buttonDefault: {
    borderColor: '#3c87f7',
  },
  buttonDanger: {
    borderColor: '#d95c5c',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    fontSize: 14,
    textAlign: 'center',
  },
  statusHelp: {
    marginBottom: Spacing.one,
  },
  statusMessage: {
    marginTop: Spacing.one,
  },
  statusError: {
    marginTop: Spacing.one,
    color: '#d95c5c',
  },
  sessionId: {
    marginTop: Spacing.one,
  },
});
