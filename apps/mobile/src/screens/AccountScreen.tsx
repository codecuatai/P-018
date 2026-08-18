import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar as RNStatusBar,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import {
  MapPin,
  Plus,
  ChevronRight,
  User,
  CreditCard,
  Shield,
  LogOut,
  Star,
  Search,
  X,
  Trash2,
} from 'lucide-react-native';
import { ActionButton } from '../components/ui/ActionButton';
import { theme } from '../theme';
import type { AuthUser } from '../types';
import { useAddresses } from '../hooks/useAddresses';
import { getMemberLabel } from '../api/profile';
import { autocompleteAddress, type AutocompleteSuggestion, type SavedAddress } from '../api/addresses';

interface AccountScreenProps {
  user: AuthUser;
  onLogout: () => void;
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function AccountScreen({ user, onLogout }: AccountScreenProps) {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);
  const initials = user.email.trim().slice(0, 2).toUpperCase() || 'XO';

  const bottomSheetRef = useRef<BottomSheet>(null);

  const { addresses, loading: addressLoading, saving, addAddress, removeAddress } = useAddresses();

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AutocompleteSuggestion | null>(null);
  const [addressLabel, setAddressLabel] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 400);

  useEffect(() => {
    if (debouncedQuery.length < 3) { setSuggestions([]); return; }
    let cancelled = false;
    setSuggestLoading(true);
    autocompleteAddress(debouncedQuery)
      .then((result) => { if (!cancelled) setSuggestions(result.suggestions.slice(0, 5)); })
      .catch(() => { if (!cancelled) setSuggestions([]); })
      .finally(() => { if (!cancelled) setSuggestLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleOpenAddressSheet = useCallback(() => {
    setSearchQuery(''); setSuggestions([]); setSelectedSuggestion(null); setAddressLabel(''); setSheetError(null);
    bottomSheetRef.current?.expand();
  }, []);

  const handleSelectSuggestion = useCallback((suggestion: AutocompleteSuggestion) => {
    setSelectedSuggestion(suggestion);
    setSearchQuery(suggestion.address_text);
    setSuggestions([]);
    if (!addressLabel) {
      const parts = suggestion.address_text.split(',');
      setAddressLabel(parts[0]?.trim().slice(0, 40) ?? '');
    }
  }, [addressLabel]);

  const handleSaveAddress = useCallback(async () => {
    if (!selectedSuggestion) { setSheetError('Vui long chon dia chi tu danh sach goi y.'); return; }
    if (!addressLabel.trim()) { setSheetError('Vui long nhap ten cho dia chi nay.'); return; }
    setSheetError(null);
    const success = await addAddress({
      label: addressLabel.trim(),
      address_text: selectedSuggestion.address_text,
      latitude: selectedSuggestion.latitude ?? undefined,
      longitude: selectedSuggestion.longitude ?? undefined,
      source: selectedSuggestion.latitude !== null ? 'geocoded' : 'manual',
    });
    if (success) {
      bottomSheetRef.current?.close();
      setSearchQuery(''); setSelectedSuggestion(null); setAddressLabel('');
    } else {
      setSheetError('Khong the luu dia chi. Vui long thu lai.');
    }
  }, [selectedSuggestion, addressLabel, addAddress]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
    ),
    [],
  );

  const memberLabel = getMemberLabel(user.role);

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.avatarGlow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.userName} numberOfLines={1}>{user.email}</Text>
          <View style={styles.roleBadge}>
            <Star size={12} color={theme.colors.primary} fill={theme.colors.primary} />
            <Text style={styles.roleText}>{memberLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Saved Addresses</Text>
        <View style={styles.card}>
          {addressLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Dang tai dia chi...</Text>
            </View>
          ) : addresses.length === 0 ? (
            <View style={styles.emptyAddresses}>
              <Text style={styles.emptyAddressText}>Chua co dia chi nao duoc luu.</Text>
            </View>
          ) : (
            addresses.map((addr: SavedAddress, index: number) => (
              <View key={addr.id}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.listItem}>
                  <View style={[styles.iconBox, { backgroundColor: addr.is_default ? theme.colors.primaryLight : theme.colors.surfaceMuted }]}>
                    <MapPin size={18} color={addr.is_default ? theme.colors.primary : theme.colors.ink} />
                  </View>
                  <View style={styles.listTextContent}>
                    <Text style={styles.listTitle}>{addr.label}</Text>
                    <Text style={styles.listSubtitle} numberOfLines={1}>{addr.address_text}</Text>
                  </View>
                  <TouchableOpacity onPress={() => void removeAddress(addr.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.6}>
                    <Trash2 size={16} color={theme.colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          {addresses.length > 0 && <View style={styles.divider} />}
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6} onPress={handleOpenAddressSheet}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.primaryLight }]}>
              <Plus size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.listTextContent}>
              <Text style={[styles.listTitle, { color: theme.colors.primary }]}>Add New Address</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}><User size={18} color={theme.colors.ink} /></View>
            <View style={styles.listTextContent}><Text style={styles.listTitle}>Personal Details</Text></View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}><CreditCard size={18} color={theme.colors.ink} /></View>
            <View style={styles.listTextContent}><Text style={styles.listTitle}>Payment Methods</Text></View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.listItem} activeOpacity={0.6}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}><Shield size={18} color={theme.colors.ink} /></View>
            <View style={styles.listTextContent}><Text style={styles.listTitle}>Security</Text></View>
            <ChevronRight size={18} color={theme.colors.mutedLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.logoutWrapper}>
          <ActionButton label="Log out" icon={<LogOut size={18} color={theme.colors.danger} />} variant="danger" onPress={onLogout} size="lg" />
        </View>
      </ScrollView>

      <BottomSheet ref={bottomSheetRef} index={-1} snapPoints={['65%']} enablePanDownToClose backdropComponent={renderBackdrop} backgroundStyle={styles.bottomSheetBackground} handleIndicatorStyle={styles.bottomSheetIndicator} keyboardBehavior="extend">
        <BottomSheetView style={styles.bottomSheetContent}>
          <Text style={styles.sheetTitle}>Add New Address</Text>
          <Text style={styles.sheetSubtitle}>Tim kiem va chon dia chi.</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Ten dia chi</Text>
            <TextInput style={styles.textInput} placeholder="Vi du: Nha, Co quan, Phong gym..." placeholderTextColor={theme.colors.muted} value={addressLabel} onChangeText={setAddressLabel} maxLength={40} />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Dia chi</Text>
            <View style={styles.searchRow}>
              <Search size={16} color={theme.colors.muted} />
              <TextInput style={styles.searchInput} placeholder="Nhap dia chi de tim kiem..." placeholderTextColor={theme.colors.muted} value={searchQuery} onChangeText={(text: string) => { setSearchQuery(text); setSelectedSuggestion(null); }} autoCorrect={false} />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSuggestions([]); setSelectedSuggestion(null); }}>
                  <X size={16} color={theme.colors.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {suggestLoading && (
            <View style={styles.suggestLoading}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.suggestLoadingText}>Dang tim kiem...</Text>
            </View>
          )}

          {suggestions.length > 0 && (
            <View style={styles.suggestionList}>
              {suggestions.map((s: AutocompleteSuggestion, i: number) => (
                <TouchableOpacity key={i} style={[styles.suggestionItem, i < suggestions.length - 1 && styles.suggestionBorder]} onPress={() => handleSelectSuggestion(s)} activeOpacity={0.7}>
                  <MapPin size={14} color={theme.colors.primary} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.address_text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedSuggestion !== null && (
            <View style={styles.selectedBadge}>
              <MapPin size={14} color={theme.colors.success} />
              <Text style={styles.selectedText} numberOfLines={1}>Da chon: {selectedSuggestion.address_text}</Text>
            </View>
          )}

          {sheetError !== null && <Text style={styles.sheetErrorText}>{sheetError}</Text>}

          <ActionButton label={saving ? 'Dang luu...' : 'Luu dia chi'} onPress={() => void handleSaveAddress()} variant="glow" size="lg" disabled={saving} style={styles.saveButton} />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { paddingBottom: 40 },
  heroSection: { alignItems: 'center', paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  avatarGlow: { width: 90, height: 90, borderRadius: 45, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.md },
  avatar: { width: 74, height: 74, borderRadius: 37, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  userName: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.ink, marginBottom: 8, maxWidth: 280, textAlign: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.primaryLight, paddingHorizontal: 12, paddingVertical: 5, borderRadius: theme.radius.full },
  roleText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: theme.colors.primary },
  sectionTitle: { fontSize: theme.fontSize.xs, fontWeight: '700', color: theme.colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, marginHorizontal: theme.spacing.lg, borderRadius: theme.radius.xl, overflow: 'hidden', ...theme.shadow.sm },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 14 },
  iconBox: { width: 36, height: 36, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  listTextContent: { flex: 1 },
  listTitle: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.ink, marginBottom: 2 },
  listSubtitle: { fontSize: theme.fontSize.xs, color: theme.colors.muted },
  divider: { height: 1, backgroundColor: theme.colors.line, marginLeft: 36 + theme.spacing.md * 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: theme.spacing.md },
  loadingText: { fontSize: theme.fontSize.sm, color: theme.colors.muted },
  emptyAddresses: { padding: theme.spacing.md },
  emptyAddressText: { fontSize: theme.fontSize.sm, color: theme.colors.muted, textAlign: 'center' },
  logoutWrapper: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl },
  bottomSheetBackground: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  bottomSheetIndicator: { backgroundColor: theme.colors.line, width: 40 },
  bottomSheetContent: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  sheetTitle: { fontSize: theme.fontSize.xl, fontWeight: '800', color: theme.colors.ink, marginBottom: 4 },
  sheetSubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.muted, marginBottom: theme.spacing.lg },
  inputWrapper: { marginBottom: theme.spacing.md },
  inputLabel: { fontSize: theme.fontSize.xs, fontWeight: '700', color: theme.colors.inkSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: theme.fontSize.sm, color: theme.colors.ink, backgroundColor: theme.colors.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.md, paddingHorizontal: 14, backgroundColor: theme.colors.background, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  suggestLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: theme.spacing.sm },
  suggestLoadingText: { fontSize: theme.fontSize.xs, color: theme.colors.muted },
  suggestionList: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.md, overflow: 'hidden', marginBottom: theme.spacing.md, backgroundColor: theme.colors.surface },
  suggestionItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 8 },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  suggestionText: { flex: 1, fontSize: theme.fontSize.sm, color: theme.colors.ink, lineHeight: 18 },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.successBg, borderRadius: theme.radius.sm, padding: 10, marginBottom: theme.spacing.md },
  selectedText: { flex: 1, fontSize: theme.fontSize.xs, color: theme.colors.success, fontWeight: '600' },
  sheetErrorText: { fontSize: theme.fontSize.xs, color: theme.colors.danger, marginBottom: theme.spacing.sm },
  saveButton: { marginTop: theme.spacing.sm },
});
