import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface DetailRowProps {
  label: string;
  value: string;
}

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lineLight,
  },
  label: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginBottom: 2,
    fontWeight: '600',
  },
  value: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.ink,
  },
});
