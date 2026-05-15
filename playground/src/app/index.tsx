import {
  allocation,
  allocationTimeline,
  cpuProfile,
  memorySnapshot,
  memoryUsage,
  network,
  trace,
  type JsAllocationStatusResponse,
  type JsAllocationTimelineStatusResponse,
  type JsMemorySampleResponse,
  type JsProfileStatusResponse,
  type MemSnapshotCaptureResponse,
  type NetworkStatusResponse,
  type TraceStatusResponse,
  type TraceStopResponse,
} from '@agent-cdp/sdk';
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

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString();
}

function formatMaybeMs(value: number | null) {
  return value === null ? 'unknown' : String(value);
}

function formatBytes(value: number) {
  return `${Math.round(value / 1024)} KB`;
}

export default function HomeScreen() {
  const [sdkBusy, setSdkBusy] = useState(false);
  const [sdkFlowMessage, setSdkFlowMessage] = useState('Select the app target with agent-cdp, then run the SDK CPU profile flow.');
  const [sdkFlowError, setSdkFlowError] = useState<string | null>(null);
  const [sdkStatus, setSdkStatus] = useState<JsProfileStatusResponse | null>(null);
  const [lastSdkProfileSessionId, setLastSdkProfileSessionId] = useState<string | null>(null);
  const [traceStatus, setTraceStatus] = useState<TraceStatusResponse | null>(null);
  const [traceMessage, setTraceMessage] = useState('Run a trace flow to capture a bounded trace session.');
  const [traceError, setTraceError] = useState<string | null>(null);
  const [lastTraceResult, setLastTraceResult] = useState<TraceStopResponse | null>(null);
  const [networkStatusState, setNetworkStatusState] = useState<NetworkStatusResponse | null>(null);
  const [networkMessage, setNetworkMessage] = useState('Run a network flow to capture a bounded network session.');
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [lastNetworkSessionId, setLastNetworkSessionId] = useState<string | null>(null);
  const [allocationStatusState, setAllocationStatusState] = useState<JsAllocationStatusResponse | null>(null);
  const [allocationMessage, setAllocationMessage] = useState('Run an allocation flow to capture sampled allocations.');
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [lastAllocationSessionId, setLastAllocationSessionId] = useState<string | null>(null);
  const [allocationTimelineStatusState, setAllocationTimelineStatusState] = useState<JsAllocationTimelineStatusResponse | null>(null);
  const [allocationTimelineMessage, setAllocationTimelineMessage] = useState(
    'Run an allocation timeline flow to capture timeline allocation data.',
  );
  const [allocationTimelineError, setAllocationTimelineError] = useState<string | null>(null);
  const [lastAllocationTimelineSessionId, setLastAllocationTimelineSessionId] = useState<string | null>(null);
  const [lastMemorySample, setLastMemorySample] = useState<JsMemorySampleResponse | null>(null);
  const [memorySampleMessage, setMemorySampleMessage] = useState('Take a JS heap usage sample from the SDK.');
  const [memorySampleError, setMemorySampleError] = useState<string | null>(null);
  const [lastMemorySnapshot, setLastMemorySnapshot] = useState<MemSnapshotCaptureResponse | null>(null);
  const [memorySnapshotMessage, setMemorySnapshotMessage] = useState('Capture a heap snapshot from the SDK.');
  const [memorySnapshotError, setMemorySnapshotError] = useState<string | null>(null);

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
    setSdkBusy(true);
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
      setSdkBusy(false);
    }
  }

  async function refreshTraceStatus() {
    const status = await trace.status();
    setTraceStatus(status);
    setTraceError(null);
    setTraceMessage('SDK trace status refreshed.');
    return status;
  }

  async function runSdkTraceFlow() {
    setSdkBusy(true);
    setTraceError(null);
    setLastTraceResult(null);
    setTraceMessage('Checking current SDK trace status...');

    try {
      const initialStatus = await trace.status();
      setTraceStatus(initialStatus);

      if (initialStatus.active) {
        const previousResult = await trace.stop();
        console.warn('[playground] stopped existing SDK trace before test flow', previousResult);
      }

      setTraceMessage('Starting SDK trace...');
      await trace.start();

      const startMark = `sdk-trace-start-${Date.now()}`;
      markTrace(startMark);
      runProfileHotspot();
      await runAsyncProfileBurst();
      const endMark = `sdk-trace-end-${Date.now()}`;
      markTrace(endMark);
      measureTrace('playground:sdk-trace-flow', startMark, endMark);

      setTraceMessage('Stopping SDK trace...');
      const result = await trace.stop();
      setLastTraceResult(result);
      const finalStatus = await trace.status();
      setTraceStatus(finalStatus);
      setTraceMessage(`Trace captured. Session ID: ${result.sessionId}`);
      logState('sdk-trace-flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTraceError(message);
      setTraceMessage(`SDK trace flow failed: ${message}`);
    } finally {
      setSdkBusy(false);
    }
  }

  async function refreshNetworkStatus() {
    const status = await network.status();
    setNetworkStatusState(status);
    setNetworkError(null);
    setNetworkMessage('SDK network status refreshed.');
    return status;
  }

  async function runSdkNetworkFlow() {
    setSdkBusy(true);
    setNetworkError(null);
    setLastNetworkSessionId(null);
    setNetworkMessage('Checking current SDK network status...');

    try {
      const initialStatus = await network.status();
      setNetworkStatusState(initialStatus);

      if (initialStatus.activeSession) {
        const previousSessionId = await network.stop();
        console.warn('[playground] stopped existing SDK network session before test flow', {
          previousSessionId,
          initialStatus,
        });
      }

      setNetworkMessage('Starting SDK network capture...');
      await network.start({ name: `playground-network-${Date.now()}` });
      await runNetworkBurst();

      setNetworkMessage('Stopping SDK network capture...');
      const sessionId = await network.stop();
      setLastNetworkSessionId(sessionId);
      const finalStatus = await network.status();
      setNetworkStatusState(finalStatus);
      setNetworkMessage(`Network capture stored. Session ID: ${sessionId}`);
      logState('sdk-network-flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNetworkError(message);
      setNetworkMessage(`SDK network flow failed: ${message}`);
    } finally {
      setSdkBusy(false);
    }
  }

  async function refreshAllocationStatus() {
    const status = await allocation.status();
    setAllocationStatusState(status);
    setAllocationError(null);
    setAllocationMessage('SDK allocation status refreshed.');
    return status;
  }

  async function runSdkAllocationFlow() {
    setSdkBusy(true);
    setAllocationError(null);
    setLastAllocationSessionId(null);
    setAllocationMessage('Checking current SDK allocation status...');

    try {
      const initialStatus = await allocation.status();
      setAllocationStatusState(initialStatus);

      if (initialStatus.active) {
        const previousSessionId = await allocation.stop();
        console.warn('[playground] stopped existing SDK allocation session before test flow', {
          previousSessionId,
          initialStatus,
        });
      }

      setAllocationMessage('Starting SDK allocation capture...');
      await allocation.start({ name: `playground-allocation-${Date.now()}` });
      retainSmallBatch();
      createTransientObjects();

      setAllocationMessage('Stopping SDK allocation capture...');
      const sessionId = await allocation.stop();
      setLastAllocationSessionId(sessionId);
      const finalStatus = await allocation.status();
      setAllocationStatusState(finalStatus);
      setAllocationMessage(`Allocation capture stored. Session ID: ${sessionId}`);
      logState('sdk-allocation-flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAllocationError(message);
      setAllocationMessage(`SDK allocation flow failed: ${message}`);
    } finally {
      setSdkBusy(false);
    }
  }

  async function refreshAllocationTimelineStatus() {
    const status = await allocationTimeline.status();
    setAllocationTimelineStatusState(status);
    setAllocationTimelineError(null);
    setAllocationTimelineMessage('SDK allocation timeline status refreshed.');
    return status;
  }

  async function runSdkAllocationTimelineFlow() {
    setSdkBusy(true);
    setAllocationTimelineError(null);
    setLastAllocationTimelineSessionId(null);
    setAllocationTimelineMessage('Checking current SDK allocation timeline status...');

    try {
      const initialStatus = await allocationTimeline.status();
      setAllocationTimelineStatusState(initialStatus);

      if (initialStatus.active) {
        const previousSessionId = await allocationTimeline.stop();
        console.warn('[playground] stopped existing SDK allocation timeline session before test flow', {
          previousSessionId,
          initialStatus,
        });
      }

      setAllocationTimelineMessage('Starting SDK allocation timeline capture...');
      await allocationTimeline.start({ name: `playground-allocation-timeline-${Date.now()}` });
      retainLargeBatch();
      createTransientObjects();

      setAllocationTimelineMessage('Stopping SDK allocation timeline capture...');
      const sessionId = await allocationTimeline.stop();
      setLastAllocationTimelineSessionId(sessionId);
      const finalStatus = await allocationTimeline.status();
      setAllocationTimelineStatusState(finalStatus);
      setAllocationTimelineMessage(`Allocation timeline stored. Session ID: ${sessionId}`);
      logState('sdk-allocation-timeline-flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAllocationTimelineError(message);
      setAllocationTimelineMessage(`SDK allocation timeline flow failed: ${message}`);
    } finally {
      setSdkBusy(false);
    }
  }

  async function takeMemoryUsageSample() {
    setSdkBusy(true);
    setMemorySampleError(null);
    setMemorySampleMessage('Taking SDK JS memory sample...');

    try {
      const sample = await memoryUsage.sample({
        label: `playground-memory-sample-${Date.now()}`,
        collectGarbage: true,
      });
      setLastMemorySample(sample);
      setMemorySampleMessage(`Memory sample captured. Sample ID: ${sample.sampleId}`);
      logState('sdk-memory-sample');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMemorySampleError(message);
      setMemorySampleMessage(`SDK memory sample failed: ${message}`);
    } finally {
      setSdkBusy(false);
    }
  }

  async function captureMemorySnapshot() {
    setSdkBusy(true);
    setMemorySnapshotError(null);
    setMemorySnapshotMessage('Capturing SDK memory snapshot...');

    try {
      const snapshot = await memorySnapshot.capture({
        name: `playground-memory-snapshot-${Date.now()}`,
        collectGarbage: true,
      });
      setLastMemorySnapshot(snapshot);
      setMemorySnapshotMessage(`Memory snapshot captured. Snapshot ID: ${snapshot.snapshotId}`);
      logState('sdk-memory-snapshot');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMemorySnapshotError(message);
      setMemorySnapshotMessage(`SDK memory snapshot failed: ${message}`);
    } finally {
      setSdkBusy(false);
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
          <ThemedView style={styles.sectionCard} type="backgroundElement">
            <ThemedText type="smallBold">CLI Testing</ThemedText>
            <ThemedText style={styles.sectionHelp} themeColor="textSecondary" type="small">
              Use these fake actions to exercise agent-cdp CLI inspection, profiling, memory, console, and network workflows.
            </ThemedText>
            <ThemedView style={styles.buttonGroup}>
              <ScenarioButton label="Retain 250 objects" onPress={retainSmallBatch} />
              <ScenarioButton label="Retain 1200 objects" onPress={retainLargeBatch} />
              <ScenarioButton label="Create transient churn" onPress={createTransientObjects} />
              <ScenarioButton label="Emit console burst" onPress={emitConsoleBurst} />
              <ScenarioButton label="Run CPU hotspot" onPress={runProfileHotspot} />
              <ScenarioButton label="Run async burst" onPress={runAsyncProfileBurst} />
              <ScenarioButton label="Run network burst" onPress={runNetworkBurst} />
              <ScenarioButton label="Log inspection payload" onPress={logSamplePayload} />
              <ScenarioButton label="Clear retained batches" onPress={clearRetainedBatches} variant="danger" />
            </ThemedView>
          </ThemedView>
          <ThemedView style={styles.sectionCard} type="backgroundElement">
            <ThemedText type="smallBold">SDK Testing</ThemedText>
            <ThemedText style={styles.sectionHelp} themeColor="textSecondary" type="small">
              Use these controls after selecting the Expo target with the daemon to validate the runtime SDK bridge.
            </ThemedText>
            <ThemedView style={styles.buttonGroup}>
              <ScenarioButton
                disabled={sdkBusy}
                label={sdkBusy ? 'Running SDK CPU profile flow...' : 'Run SDK CPU profile flow'}
                onPress={() => {
                  void runSdkCpuProfileFlow();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Refresh SDK profile status"
                onPress={() => {
                  void refreshSdkCpuProfileStatus();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Run SDK trace flow"
                onPress={() => {
                  void runSdkTraceFlow();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Refresh SDK trace status"
                onPress={() => {
                  void refreshTraceStatus();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Run SDK network flow"
                onPress={() => {
                  void runSdkNetworkFlow();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Refresh SDK network status"
                onPress={() => {
                  void refreshNetworkStatus();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Run SDK allocation flow"
                onPress={() => {
                  void runSdkAllocationFlow();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Refresh SDK allocation status"
                onPress={() => {
                  void refreshAllocationStatus();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Run SDK allocation timeline flow"
                onPress={() => {
                  void runSdkAllocationTimelineFlow();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Refresh SDK allocation timeline status"
                onPress={() => {
                  void refreshAllocationTimelineStatus();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Take SDK memory sample"
                onPress={() => {
                  void takeMemoryUsageSample();
                }}
              />
              <ScenarioButton
                disabled={sdkBusy}
                label="Capture SDK memory snapshot"
                onPress={() => {
                  void captureMemorySnapshot();
                }}
              />
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK CPU Profile E2E</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                The flow starts profiling, runs a deterministic JS workload, then stops and reports the session.
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
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Trace E2E</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Starts a trace, runs a small traced workload, then stops and reports the stored session.
              </ThemedText>
              <ThemedText type="small">Active: {traceStatus ? (traceStatus.active ? 'yes' : 'no') : 'unknown'}</ThemedText>
              <ThemedText type="small">Sessions recorded: {traceStatus?.sessionCount ?? 'unknown'}</ThemedText>
              <ThemedText type="small">Elapsed ms: {formatMaybeMs(traceStatus?.elapsedMs ?? null)}</ThemedText>
              <ThemedText style={traceError ? styles.statusError : styles.statusMessage} type="small">
                {traceMessage}
              </ThemedText>
              {lastTraceResult ? (
                <ThemedText selectable style={styles.sessionId} type="code">
                  Last session ID: {lastTraceResult.sessionId}
                </ThemedText>
              ) : null}
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Network E2E</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Starts a bounded network capture, runs the local burst, then stops and reports the stored session.
              </ThemedText>
              <ThemedText type="small">Attached: {networkStatusState ? (networkStatusState.attached ? 'yes' : 'no') : 'unknown'}</ThemedText>
              <ThemedText type="small">Live requests: {networkStatusState?.liveRequestCount ?? 'unknown'}</ThemedText>
              <ThemedText type="small">Stored sessions: {networkStatusState?.storedSessionCount ?? 'unknown'}</ThemedText>
              <ThemedText type="small">
                Active session: {networkStatusState?.activeSession?.name ?? networkStatusState?.activeSession?.id ?? 'none'}
              </ThemedText>
              <ThemedText style={networkError ? styles.statusError : styles.statusMessage} type="small">
                {networkMessage}
              </ThemedText>
              {lastNetworkSessionId ? (
                <ThemedText selectable style={styles.sessionId} type="code">
                  Last session ID: {lastNetworkSessionId}
                </ThemedText>
              ) : null}
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Allocation E2E</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Starts sampled allocation capture around retained-object and transient-churn work.
              </ThemedText>
              <ThemedText type="small">Active: {allocationStatusState ? (allocationStatusState.active ? 'yes' : 'no') : 'unknown'}</ThemedText>
              <ThemedText type="small">Sessions recorded: {allocationStatusState?.sessionCount ?? 'unknown'}</ThemedText>
              <ThemedText type="small">Elapsed ms: {formatMaybeMs(allocationStatusState?.elapsedMs ?? null)}</ThemedText>
              <ThemedText type="small">Active name: {allocationStatusState?.activeName ?? 'none'}</ThemedText>
              <ThemedText style={allocationError ? styles.statusError : styles.statusMessage} type="small">
                {allocationMessage}
              </ThemedText>
              {lastAllocationSessionId ? (
                <ThemedText selectable style={styles.sessionId} type="code">
                  Last session ID: {lastAllocationSessionId}
                </ThemedText>
              ) : null}
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Allocation Timeline E2E</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Starts allocation timeline capture around a larger retained-object workload.
              </ThemedText>
              <ThemedText type="small">
                Active: {allocationTimelineStatusState ? (allocationTimelineStatusState.active ? 'yes' : 'no') : 'unknown'}
              </ThemedText>
              <ThemedText type="small">Sessions recorded: {allocationTimelineStatusState?.sessionCount ?? 'unknown'}</ThemedText>
              <ThemedText type="small">Elapsed ms: {formatMaybeMs(allocationTimelineStatusState?.elapsedMs ?? null)}</ThemedText>
              <ThemedText type="small">Active name: {allocationTimelineStatusState?.activeName ?? 'none'}</ThemedText>
              <ThemedText style={allocationTimelineError ? styles.statusError : styles.statusMessage} type="small">
                {allocationTimelineMessage}
              </ThemedText>
              {lastAllocationTimelineSessionId ? (
                <ThemedText selectable style={styles.sessionId} type="code">
                  Last session ID: {lastAllocationTimelineSessionId}
                </ThemedText>
              ) : null}
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Memory Usage Sample</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Captures a single JS heap usage sample and stores the returned sample ID.
              </ThemedText>
              <ThemedText style={memorySampleError ? styles.statusError : styles.statusMessage} type="small">
                {memorySampleMessage}
              </ThemedText>
              {lastMemorySample ? (
                <>
                  <ThemedText selectable style={styles.sessionId} type="code">
                    Sample ID: {lastMemorySample.sampleId}
                  </ThemedText>
                  <ThemedText type="small">Used heap: {formatBytes(lastMemorySample.usedJSHeapSize)}</ThemedText>
                  <ThemedText type="small">Captured at: {formatTimestamp(lastMemorySample.timestamp)}</ThemedText>
                </>
              ) : null}
            </ThemedView>
            <ThemedView style={styles.statusCard}>
              <ThemedText type="smallBold">SDK Memory Snapshot</ThemedText>
              <ThemedText style={styles.statusHelp} themeColor="textSecondary" type="small">
                Captures a heap snapshot and stores the returned snapshot ID for later CLI analysis.
              </ThemedText>
              <ThemedText style={memorySnapshotError ? styles.statusError : styles.statusMessage} type="small">
                {memorySnapshotMessage}
              </ThemedText>
              {lastMemorySnapshot ? (
                <>
                  <ThemedText selectable style={styles.sessionId} type="code">
                    Snapshot ID: {lastMemorySnapshot.snapshotId}
                  </ThemedText>
                  <ThemedText type="small">Nodes: {lastMemorySnapshot.nodeCount}</ThemedText>
                  <ThemedText type="small">Captured at: {formatTimestamp(lastMemorySnapshot.capturedAt)}</ThemedText>
                </>
              ) : null}
            </ThemedView>
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
    gap: Spacing.three,
  },
  sectionCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  buttonGroup: {
    width: '100%',
    gap: Spacing.three,
  },
  statusCard: {
    width: '100%',
    borderRadius: Spacing.three,
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
  sectionHelp: {
    marginTop: -Spacing.one,
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
