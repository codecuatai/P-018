import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface MetricItem {
  label: string;
  value: string;
}

interface MetricRowProps {
  metrics: MetricItem[];
}

export function MetricRow({ metrics }: MetricRowProps) {
  return (
    <View style={styles.container}>
      {metrics.map((item, index) => (
        <View
          key={index}
          style={[
            styles.metricBox,
            index < metrics.length - 1 && styles.metricDivider,
          ]}
        >
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingVertical: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  metricDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.line,
  },
  label: {
    fontSize: 10,
    color: theme.colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.ink,
    textAlign: 'center',
  },
});
