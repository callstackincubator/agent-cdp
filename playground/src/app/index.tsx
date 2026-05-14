import { Pressable, StyleSheet } from 'react-native';
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

function ScenarioButton({
  label,
  onPress,
  variant = 'default',
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' ? styles.buttonDanger : styles.buttonDefault,
        pressed && styles.buttonPressed,
      ]}
      testID={label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
      <ThemedText type="smallBold" style={styles.buttonLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
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
    const summary = runCpuHotspot(Date.now());
    console.log('[playground] cpu hotspot summary', summary);
    logState('cpu-hotspot');
  }

  async function runAsyncProfileBurst() {
    const summary = await runAsyncBurst(Date.now());
    console.log('[playground] async burst summary', summary);
    logState('async-burst');
  }

  function logSamplePayload() {
    const payload = createInspectionPayload();

    console.log('[playground] inspection payload', payload);
    logState('log-payload');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.buttonGroup}>
          <ScenarioButton label="Retain 250 objects" onPress={retainSmallBatch} />
          <ScenarioButton label="Retain 1200 objects" onPress={retainLargeBatch} />
          <ScenarioButton label="Create transient churn" onPress={createTransientObjects} />
          <ScenarioButton label="Emit console burst" onPress={emitConsoleBurst} />
          <ScenarioButton label="Run CPU hotspot" onPress={runProfileHotspot} />
          <ScenarioButton label="Run async burst" onPress={runAsyncProfileBurst} />
          <ScenarioButton label="Log inspection payload" onPress={logSamplePayload} />
          <ScenarioButton label="Clear retained batches" onPress={clearRetainedBatches} variant="danger" />
        </ThemedView>
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  buttonGroup: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
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
  buttonLabel: {
    fontSize: 14,
    textAlign: 'center',
  },
});
