import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

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

function ScenarioButton({
  label,
  description,
  onPress,
  variant = 'default',
}: {
  label: string;
  description: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <Pressable
      accessibilityHint={description}
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
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [status, setStatus] = useState('Ready for agent-cdp inspection.');
  const [totals, setTotals] = useState(() => getTotals());

  function syncState(nextStatus: string) {
    setTotals(getTotals());
    setStatus(nextStatus);
  }

  function retainSmallBatch() {
    const batch = createRetainedBatch('small', 250);
    getStore().batches.push(batch);
    console.log('[playground] retained small batch', batch.id, batch.samples[0]);
    syncState(`Retained 250 objects in ${batch.id}.`);
  }

  function retainLargeBatch() {
    const batch = createRetainedBatch('large', 1200);
    getStore().batches.push(batch);
    console.log('[playground] retained large batch', batch.id, batch.samples.at(-1));
    syncState(`Retained 1200 objects in ${batch.id}.`);
  }

  function clearRetainedBatches() {
    getStore().batches = [];
    console.log('[playground] cleared retained batches');
    syncState('Cleared all retained objects from the global store.');
  }

  function createTransientObjects() {
    const checksum = triggerTransientChurn();
    console.log('[playground] transient churn checksum', checksum);
    syncState(`Created transient objects only. Checksum ${checksum}.`);
  }

  function logSamplePayload() {
    const payload = {
      now: new Date().toISOString(),
      totals: getTotals(),
      latestBatch: getStore().batches.at(-1) ?? null,
    };

    console.log('[playground] inspection payload', payload);
    syncState('Logged the latest payload for runtime inspection.');
  }

  const statCards: { label: string; value: string; style?: ViewStyle }[] = [
    { label: 'Retained batches', value: String(totals.batchCount) },
    { label: 'Retained objects', value: String(totals.retainedObjectCount) },
    { label: 'Global handle', value: '__agentCdpPlayground', style: styles.codeCard },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
          <ThemedView style={styles.heroSection}>
            <ThemedText type="title" style={styles.title}>
              agent-cdp
            </ThemedText>
            <ThemedText type="subtitle" style={styles.subtitle}>
              Playground
            </ThemedText>
            <ThemedText style={styles.lead} themeColor="textSecondary">
              Use these controls to create retained memory, transient churn, and structured runtime
              payloads that agent-cdp should detect over a live device session.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.statsRow}>
            {statCards.map((card) => (
              <ThemedView key={card.label} type="backgroundElement" style={[styles.statCard, card.style]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {card.label}
                </ThemedText>
                <ThemedText type="subtitle" style={styles.statValue}>
                  {card.value}
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.stepContainer}>
            <ThemedText type="smallBold">Scenario actions</ThemedText>
            <ScenarioButton
              label="Retain 250 objects"
              description="Stores a small batch on global state so memory tools can inspect it."
              onPress={retainSmallBatch}
            />
            <ScenarioButton
              label="Retain 1200 objects"
              description="Creates a heavier retained batch to make memory deltas obvious."
              onPress={retainLargeBatch}
            />
            <ScenarioButton
              label="Create transient churn"
              description="Allocates many objects without retaining them for comparison."
              onPress={createTransientObjects}
            />
            <ScenarioButton
              label="Log inspection payload"
              description="Prints the latest retained batch shape to the runtime console."
              onPress={logSamplePayload}
            />
            <ScenarioButton
              label="Clear retained batches"
              description="Releases the global store so agent-cdp can confirm cleanup."
              onPress={clearRetainedBatches}
              variant="danger"
            />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <ThemedText type="smallBold">Latest status</ThemedText>
            <ThemedText>{status}</ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <ThemedText type="smallBold">Suggested checks</ThemedText>
            <ThemedText type="small">
              1. Attach through agent-device, then connect agent-cdp to the running app.
            </ThemedText>
            <ThemedText type="small">
              2. Press a retain button and verify retained object counts rise in memory output.
            </ThemedText>
            <ThemedText type="small">
              3. Press clear and verify the retained store disappears or drops sharply.
            </ThemedText>
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
  },
  scrollView: {
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  heroSection: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 44,
    lineHeight: 48,
  },
  subtitle: {
    fontSize: 24,
    lineHeight: 28,
  },
  lead: {
    maxWidth: 640,
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    flexGrow: 1,
    minWidth: 180,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.one,
  },
  codeCard: {
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  button: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
    borderWidth: 1,
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
    fontSize: 16,
  },
  statusCard: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
});
