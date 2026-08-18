import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar as RNStatusBar,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { 
  Home, 
  Briefcase, 
  Plus, 
  ChevronRight, 
  User, 
  CreditCard, 
  Shield, 
  LogOut,
  Star
} from 'lucide-react-native';
import { ActionButton } from '../components/ui/ActionButton';
import { theme } from '../theme';
import type { AuthUser } from '../types';

interface AccountScreenProps {
  user: AuthUser;
  onLogout: () => void;
}

export function AccountScreen({ user, onLogout }: AccountScreenProps) {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);
  const initials = user.email.trim().slice(0, 2).toUpperCase() || 'XO';

  // Bottom Sheet Ref
  const bottomSheetRef = useRef<BottomSheet>(null);

  const handleOpenAddressSheet = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.avatarGlow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          
          <Text style={styles.userName} numberOfLines={1}>{user.email}</Text>
          
          <View style={styles.roleBadge}>
            <Star size={12} color={theme.colors.primary} fill={theme.colors.primary} />
            <Text style={styles.roleText}>
              Premium Member
            </Text>
          </View>
        </View>

        {/* Saved Addresses Module */}
        <Text style={styles.sectionTitle}>Saved Addresses</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Home size={18} color={theme.colors.ink} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={styles.listTitle}>Home</Text>
              <Text style={styles.listSubtitle}>12 Nguyen Trai, Ha Noi</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Briefcase size={18} color={theme.colors.ink} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={styles.listTitle}>Work</Text>
              <Text style={styles.listSubtitle}>VinUniversity, Gia Lam</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.listItem} activeOpacity={0.6} onPress={handleOpenAddressSheet}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.primaryLight }]}>
              <Plus size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={[styles.listTitle, { color: theme.colors.primary }]}>Add New Address</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Settings List */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <User size={18} color={theme.colors.ink} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={styles.listTitle}>Personal Details</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <CreditCard size={18} color={theme.colors.ink} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={styles.listTitle}>Payment Methods</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Shield size={18} color={theme.colors.ink} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={styles.listTitle}>Security</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>
        </View>

        {/* Logout Action */}
        <View style={styles.logoutWrapper}>
          <ActionButton
            label="Log out"
            icon={<LogOut size={18} color={theme.colors.danger} />}
            variant="danger"
            onPress={onLogout}
            size="lg"
            style={styles.logoutButton}
          />
        </View>
      </ScrollView>

      {/* Bottom Sheet for Add Address */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['50%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={styles.bottomSheetIndicator}
      >
        <BottomSheetView style={styles.bottomSheetContent}>
          <Text style={styles.sheetTitle}>Add New Address</Text>
          <Text style={styles.sheetSubtitle}>Search or pin a location on the map.</Text>
          
          {/* Placeholder for map/search */}
          <View style={styles.sheetPlaceholder}>
            <Text style={styles.sheetPlaceholderText}>Address Search Input...</Text>
          </View>
          
          <ActionButton
            label="Save Address"
            onPress={() => bottomSheetRef.current?.close()}
            variant="glow"
            size="lg"
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.lg,
    paddingBottom: 60,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xxl,
  },
  avatarGlow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  userName: {
    fontSize: theme.fontSize.xl,
    fontWeight: '900',
    color: theme.colors.ink,
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.sm,
    ...theme.shadow.md,
    marginBottom: theme.spacing.xxl,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  listTextContent: {
    flex: 1,
    justifyContent: 'center',
  },
  listTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  listSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.lineLight,
    marginLeft: 68, // aligns with text
  },
  logoutWrapper: {
    marginTop: theme.spacing.xl,
  },
  logoutButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
  },
  bottomSheetBackground: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
  },
  bottomSheetIndicator: {
    backgroundColor: theme.colors.surfaceMuted,
    width: 40,
  },
  bottomSheetContent: {
    padding: theme.spacing.xl,
    flex: 1,
  },
  sheetTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '900',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.muted,
    marginBottom: theme.spacing.xl,
  },
  sheetPlaceholder: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.lg,
    height: 100,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  sheetPlaceholderText: {
    color: theme.colors.mutedLight,
    fontWeight: '600',
  }
});
