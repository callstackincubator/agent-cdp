import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function WorkflowScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingTop: Math.max(insets.top, Spacing.four),
          paddingLeft: insets.left + Spacing.four,
          paddingRight: insets.right + Spacing.four,
          paddingBottom: insets.bottom,
        },
      ]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">E2E Workflow</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Use this screen as the in-app checklist while validating agent-device navigation and
            agent-cdp runtime inspection together.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.sectionsWrapper}>
          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="smallBold">1. Launch the app</ThemedText>
            <ThemedText type="small">
              Start Expo with <ThemedText type="code">pnpm --dir playground start</ThemedText>,
              then open the iOS simulator or a connected device.
            </ThemedText>
            <ThemedText type="small">
              Verify agent-device can open the app, land on the{' '}
              <ThemedText type="code">Scenarios</ThemedText> tab, and tap the buttons without
              ambiguous labels.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="smallBold">2. Validate retained memory</ThemedText>
            <ThemedText type="small">
              Tap <ThemedText type="code">Retain 250 objects</ThemedText> or{' '}
              <ThemedText type="code">Retain 1200 objects</ThemedText>. The app stores those
              batches on <ThemedText type="code">globalThis.__agentCdpPlayground</ThemedText>.
            </ThemedText>
            <ThemedText type="small">
              Use agent-cdp memory commands to confirm retained object counts and object shapes show
              up after each tap.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="smallBold">3. Compare against transient churn</ThemedText>
            <ThemedText type="small">
              Tap <ThemedText type="code">Create transient churn</ThemedText> and compare memory
              output with the retained batch actions. This should create activity without long-lived
              objects remaining in the store.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="smallBold">4. Inspect runtime payloads</ThemedText>
            <ThemedText type="small">
              Tap <ThemedText type="code">Log inspection payload</ThemedText> to emit a structured
              console payload. Use agent-cdp console or runtime tooling to inspect the latest batch
              details.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="smallBold">5. Verify cleanup</ThemedText>
            <ThemedText type="small">
              Tap <ThemedText type="code">Clear retained batches</ThemedText>, then confirm the
              store is empty in the UI and the retained memory view drops accordingly.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  centerText: {
    maxWidth: 640,
  },
  sectionsWrapper: {
    gap: Spacing.three,
  },
  sectionCard: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
});
