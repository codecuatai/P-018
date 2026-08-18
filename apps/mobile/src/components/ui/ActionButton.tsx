import React, { ReactNode } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { theme } from '../../theme';

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'glow';
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
}

export function ActionButton({
  label,
  onPress,
  icon,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  textStyle,
  size = 'md',
}: ActionButtonProps) {
  const getButtonStyles = () => {
    switch (variant) {
      case 'secondary':
        return [styles.secondary, { borderColor: theme.colors.primaryBorder }];
      case 'danger':
        return [styles.danger, { borderColor: theme.colors.dangerBorder }];
      case 'outline':
        return [styles.outline, { borderColor: theme.colors.line }];
      case 'glow':
        return [styles.glow, { backgroundColor: theme.colors.primary }];
      default:
        return [styles.primary, { backgroundColor: theme.colors.primary }];
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'secondary':
      case 'outline':
        return { color: theme.colors.primary };
      case 'danger':
        return { color: theme.colors.danger };
      default:
        return { color: '#FFFFFF' };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.sm };
      case 'lg':
        return { paddingVertical: 15, paddingHorizontal: 22, borderRadius: theme.radius.md };
      default:
        return { paddingVertical: 12, paddingHorizontal: 18, borderRadius: theme.radius.md };
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        getSizeStyles(),
        getButtonStyles(),
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'outline' ? theme.colors.primary : '#FFFFFF'}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon}
          <Text
            style={[
              styles.text,
              size === 'sm' && styles.textSm,
              size === 'lg' && styles.textLg,
              getTextStyles(),
              textStyle,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  glow: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  secondary: {
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
  },
  outline: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  textSm: {
    fontSize: theme.fontSize.xs,
  },
  textLg: {
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
});
