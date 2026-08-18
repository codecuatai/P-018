import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from './ui/BrandLogo';
import { theme } from '../theme';

interface WelcomeStateProps {
  onStart: (prompt: string) => void;
}

export function WelcomeState({ onStart }: WelcomeStateProps) {
  const prompts = [
    {
      title: 'Đặt xe VinFast từ VinUni đến Hồ Gươm',
      icon: 'car-sport' as const,
      color: theme.colors.ride,
      bg: theme.colors.rideBg,
      cardBg: theme.colors.rideCardBg,
      borderColor: theme.colors.rideBorder,
      category: 'Chuyến xe',
    },
    {
      title: 'Tối nay tìm nhà hàng sang trọng cho 2 người ở Hà Nội',
      icon: 'restaurant' as const,
      color: theme.colors.restaurant,
      bg: theme.colors.restaurantBg,
      cardBg: theme.colors.restaurantCardBg,
      borderColor: theme.colors.restaurantBorder,
      category: 'Nhà hàng',
    },
    {
      title: 'Đặt lịch khám chuyên khoa Thần kinh sáng mai',
      icon: 'medkit' as const,
      color: theme.colors.healthcare,
      bg: theme.colors.healthcareBg,
      cardBg: theme.colors.healthcareCardBg,
      borderColor: theme.colors.healthcareBorder,
      category: 'Y tế',
    },
    {
      title: 'Tìm phở bò tái lăn giao tận nơi trong 20 phút',
      icon: 'fast-food' as const,
      color: theme.colors.food,
      bg: theme.colors.foodBg,
      cardBg: theme.colors.foodCardBg,
      borderColor: theme.colors.foodBorder,
      category: 'Đồ ăn',
    },
  ];

  return (
    <View style={styles.container}>
      {/* AI Glowing Orb with App Logo */}
      <View style={styles.heroOrb}>
        <BrandLogo size={52} glow />
      </View>

      <Text style={styles.eyebrow}>AI CONCIERGE & BOOKING</Text>
      <Text style={styles.title}>Tôi có thể hỗ trợ gì cho bạn hôm nay?</Text>
      <Text style={styles.subtitle}>
        Trợ lý thông minh đa nhiệm: Đặt xe, gọi món, giữ bàn và hẹn bác sĩ chỉ trong một cuộc trò chuyện.
      </Text>

      {/* Quick Prompt Cards with Domain Colors */}
      <View style={styles.promptList}>
        {prompts.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.promptCard,
              { backgroundColor: item.cardBg, borderColor: item.borderColor },
            ]}
            onPress={() => onStart(item.title)}
            activeOpacity={0.75}
          >
            <View style={[styles.promptIconBox, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>

            <View style={styles.promptContent}>
              <Text style={[styles.promptCategory, { color: item.color }]}>
                {item.category.toUpperCase()}
              </Text>
              <Text style={styles.promptText}>{item.title}</Text>
            </View>

            <Ionicons name="arrow-forward" size={16} color={item.color} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
  },
  heroOrb: {
    marginBottom: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '900',
    color: theme.colors.ink,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
    marginBottom: theme.spacing.xl,
  },
  promptList: {
    width: '100%',
    gap: 10,
  },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  promptIconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  promptContent: {
    flex: 1,
    marginRight: 8,
  },
  promptCategory: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  promptText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    lineHeight: 18,
  },
});
