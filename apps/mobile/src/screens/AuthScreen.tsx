import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from '../components/ui/BrandLogo';
import { ActionButton } from '../components/ui/ActionButton';
import { theme } from '../theme';
import {
  errorText,
  setApiBaseUrl,
  getApiBaseUrl,
} from '../api/client';
import type { AuthUser } from '../types';

interface AuthScreenProps {
  onLogin: (email: string, pass: string) => Promise<AuthUser>;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState(getApiBaseUrl());
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);
  const safeBottom = Math.max(insets.bottom, 16);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (gatewayUrl.trim()) {
        setApiBaseUrl(gatewayUrl.trim());
      }
      await onLogin(email.trim(), password.trim());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Branding Header with App Logo */}
          <View style={styles.header}>
            <View style={styles.brandContainer}>
              <BrandLogo size={68} rounded glow />
            </View>

            <Text style={styles.brandName}>X-ONE CONCIERGE</Text>
            <Text style={styles.heroTitle}>Trợ lý cuộc sống.{'\n'}Tất cả trong một.</Text>
            <Text style={styles.heroSubtitle}>
              Hội thoại đa nhiệm: Đặt xe, Gọi món, Đặt bàn và Khám bệnh liền mạch trong một nơi.
            </Text>

            {/* Domain Badges */}
            <View style={styles.domainRow}>
              <View style={[styles.domainBadge, { borderColor: theme.colors.rideBorder, backgroundColor: theme.colors.rideBg }]}>
                <Ionicons name="car-sport" size={14} color={theme.colors.ride} />
                <Text style={[styles.domainText, { color: theme.colors.ride }]}>Chuyến xe</Text>
              </View>
              <View style={[styles.domainBadge, { borderColor: theme.colors.foodBorder, backgroundColor: theme.colors.foodBg }]}>
                <Ionicons name="fast-food" size={14} color={theme.colors.food} />
                <Text style={[styles.domainText, { color: theme.colors.food }]}>Đồ ăn</Text>
              </View>
              <View style={[styles.domainBadge, { borderColor: theme.colors.restaurantBorder, backgroundColor: theme.colors.restaurantBg }]}>
                <Ionicons name="restaurant" size={14} color={theme.colors.restaurant} />
                <Text style={[styles.domainText, { color: theme.colors.restaurant }]}>Nhà hàng</Text>
              </View>
              <View style={[styles.domainBadge, { borderColor: theme.colors.healthcareBorder, backgroundColor: theme.colors.healthcareBg }]}>
                <Ionicons name="medkit" size={14} color={theme.colors.healthcare} />
                <Text style={[styles.domainText, { color: theme.colors.healthcare }]}>Lịch khám</Text>
              </View>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.formEyebrow}>TRẢI NGHIỆM ỨNG DỤNG</Text>
                <Text style={styles.formTitle}>Đăng nhập tài khoản</Text>
              </View>

              <View style={styles.liveServerBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveServerText} numberOfLines={1}>
                  {gatewayUrl.replace('http://', '')}
                </Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Advanced Settings Toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced((prev) => !prev)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'settings-outline'}
                size={14}
                color={theme.colors.muted}
              />
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? 'Thu gọn cấu hình' : 'Tùy chỉnh IP Gateway & Mật khẩu'}
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.advancedSection}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Địa chỉ API Gateway (NestJS)</Text>
                  <TextInput
                    style={styles.input}
                    value={gatewayUrl}
                    onChangeText={setGatewayUrl}
                    placeholder="http://192.168.1.x:3000"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.inputHint}>
                    Tự động nhận diện IP máy tính qua mạng Wi-Fi.
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email tài khoản demo"
                    placeholderTextColor={theme.colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Mật khẩu</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mật khẩu"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry
                  />
                </View>
              </View>
            )}

            <ActionButton
              label={loading ? 'Đang kết nối…' : 'Đăng nhập'}
              icon={<Ionicons name="log-in-outline" size={17} color="#FFFFFF" />}
              loading={loading}
              variant="glow"
              onPress={handleSubmit}
              size="lg"
              style={styles.oneTapButton}
            />

            <Text style={styles.footerNote}>
              🔒 Ứng dụng native lưu token bằng Secure Storage; bản web debug chỉ giữ token trong phiên hiện tại.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  brandContainer: {
    marginBottom: theme.spacing.sm,
  },
  brandName: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: theme.fontSize.hero,
    fontWeight: '900',
    color: theme.colors.ink,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },
  domainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
  },
  domainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  domainText: {
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.line,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  formEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: 1.2,
  },
  formTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 2,
  },
  liveServerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.line,
    maxWidth: 130,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  liveServerText: {
    fontSize: 9,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dangerBg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.danger,
    flex: 1,
    lineHeight: 18,
  },
  oneTapButton: {
    marginBottom: theme.spacing.sm,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  advancedToggleText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  advancedSection: {
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: theme.spacing.sm,
  },
  inputGroup: {
    marginBottom: theme.spacing.sm,
  },
  inputLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.muted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink,
  },
  inputHint: {
    fontSize: 10,
    color: theme.colors.mutedLight,
    marginTop: 2,
  },
  footerNote: {
    fontSize: 10,
    color: theme.colors.mutedLight,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 16,
  },
});
