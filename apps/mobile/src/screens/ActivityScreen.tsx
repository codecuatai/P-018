import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  StatusBar as RNStatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';
import { Car, Utensils, Stethoscope, BedDouble, ReceiptText, RefreshCw, TrendingUp } from 'lucide-react-native';
import { theme } from '../theme';
import { useHistory, type TimeRange, type ActivityDisplayItem, type ChartBarItem } from '../hooks/useHistory';

interface ActivityScreenProps {
  onOpenChat: () => void;
}

type FilterType = 'All' | 'Ride' | 'Food' | 'Medical' | 'Other';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export function ActivityScreen({ onOpenChat: _onOpenChat }: ActivityScreenProps) {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);

  const [timeRange, setTimeRange] = useState<TimeRange>('Weekly');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  const { displayItems, loading, error, refresh, getChartData, isEmpty } = useHistory();

  // Chart data tá»« dá»¯ liá»‡u tháº­t â€” má»—i láº§n timeRange thay Ä‘á»•i, tĂ­nh láº¡i tá»« items
  const currentChartData = useMemo(() => getChartData(timeRange), [getChartData, timeRange]);

  const totalSpent = useMemo(
    () => currentChartData.reduce((acc: number, curr: ChartBarItem) => acc + curr.value, 0),
    [currentChartData],
  );

  const filteredActivities = useMemo(() => {
    if (activeFilter === 'All') return displayItems;
    return displayItems.filter((a: ActivityDisplayItem) => a.detail === activeFilter);
  }, [displayItems, activeFilter]);

  const renderFilterPill = (filter: FilterType, label: string) => {
    const isActive = activeFilter === filter;
    return (
      <TouchableOpacity
        key={filter}
        style={[styles.filterPill, isActive && styles.filterPillActive]}
        onPress={() => setActiveFilter(filter)}
        activeOpacity={0.7}
      >
        <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const getIconForCategory = (category: ActivityDisplayItem['detail']) => {
    switch (category) {
      case 'Ride': return <Car size={20} color={theme.colors.ride} />;
      case 'Food': return <Utensils size={20} color={theme.colors.food} />;
      case 'Medical': return <Stethoscope size={20} color={theme.colors.healthcare} />;
      default: return <ReceiptText size={20} color={theme.colors.primary} />;
    }
  };

  const getColorForCategory = (category: ActivityDisplayItem['detail']) => {
    switch (category) {
      case 'Ride': return theme.colors.rideBg;
      case 'Food': return theme.colors.foodBg;
      case 'Medical': return theme.colors.healthcareBg;
      default: return theme.colors.primaryLight;
    }
  };

  // Loading skeleton cho chart
  const renderChartSkeleton = () => (
    <View style={styles.skeletonChart}>
      {[60, 90, 45, 120, 75, 100, 55].map((h, i) => (
        <View key={i} style={[styles.skeletonBar, { height: h }]} />
      ))}
    </View>
  );

  const renderHeader = () => (
    <>
      {/* Top Section: Dashboard */}
      <View style={styles.dashboardContainer}>
        <Text style={styles.pageTitle}>Analytics</Text>

        {/* Segmented Control */}
        <View style={styles.segmentedControl}>
          {(['Daily', 'Weekly', 'Monthly'] as TimeRange[]).map((range) => {
            const isActive = timeRange === range;
            return (
              <TouchableOpacity
                key={range}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                onPress={() => setTimeRange(range)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {range}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Total Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Spent</Text>
          <Text style={styles.summaryAmount}>
            {loading ? 'â€”' : formatCurrency(totalSpent)}
          </Text>

          <View style={styles.chartWrapper}>
            {loading ? renderChartSkeleton() : (
              <BarChart
                data={currentChartData}
                barWidth={22}
                spacing={16}
                roundedTop
                roundedBottom
                hideRules
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: 'transparent' }}
                noOfSections={3}
                maxValue={Math.max(...currentChartData.map((d: ChartBarItem) => d.value), 1) * 1.2}
                frontColor={theme.colors.surfaceMuted}
                initialSpacing={10}
                height={140}
              />
            )}
          </View>
        </View>

        {/* Error banner */}
        {error !== null && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void refresh()} style={styles.retryButton} activeOpacity={0.7}>
              <RefreshCw size={14} color={theme.colors.danger} />
              <Text style={styles.retryText}>Thá»­ láº¡i</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter Pills */}
      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          {renderFilterPill('All', 'All')}
          {renderFilterPill('Ride', 'Rides')}
          {renderFilterPill('Food', 'Dining & Food')}
          {renderFilterPill('Medical', 'Health')}
          {renderFilterPill('Other', 'Other')}
        </ScrollView>
      </View>

      <Text style={styles.listHeader}>Recent Transactions</Text>
    </>
  );

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <FlatList
        data={filteredActivities}
        keyExtractor={(item: ActivityDisplayItem) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }: { item: ActivityDisplayItem }) => {
          const isCompleted = item.status === 'Completed' || item.status === 'COMPLETED' || item.status === 'DELIVERED';
          return (
            <View style={styles.transactionItem}>
              <View style={[styles.iconContainer, { backgroundColor: getColorForCategory(item.detail) }]}>
                {getIconForCategory(item.detail)}
              </View>

              <View style={styles.transactionMiddle}>
                <Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.transactionSubtitle}>
                  {new Date(item.timestamp).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={styles.transactionRight}>
                <Text style={styles.transactionAmount}>
                  {item.amount > 0 ? `-${formatCurrency(item.amount)}` : 'â€”'}
                </Text>
                <View style={[styles.statusBadge, isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending]}>
                  <Text style={[styles.statusText, isCompleted ? styles.statusTextCompleted : styles.statusTextPending]}>
                    {item.status}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Äang táº£i lá»‹ch sá»­...</Text>
            </View>
          ) : isEmpty ? (
            <View style={styles.emptyContainer}>
              <TrendingUp size={48} color={theme.colors.line} />
              <Text style={styles.emptyTitle}>ChÆ°a cĂ³ giao dá»‹ch nĂ o</Text>
              <Text style={styles.emptyText}>
                Lá»‹ch sá»­ giao dá»‹ch cá»§a báº¡n sáº½ xuáº¥t hiá»‡n á»Ÿ Ä‘Ă¢y sau khi báº¡n sá»­ dá»¥ng dá»‹ch vá»¥.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>KhĂ´ng cĂ³ giao dá»‹ch nĂ o trong danh má»¥c nĂ y.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  dashboardContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  pageTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: theme.spacing.lg,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    padding: 3,
    marginBottom: theme.spacing.lg,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadow.sm,
  },
  segmentText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.muted,
  },
  segmentTextActive: {
    color: theme.colors.ink,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    ...theme.shadow.md,
    marginBottom: theme.spacing.md,
  },
  summaryLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.muted,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.colors.ink,
    marginTop: 4,
    letterSpacing: -1,
  },
  chartWrapper: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
    marginLeft: -20,
  },
  skeletonChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    height: 140,
    paddingHorizontal: 10,
  },
  skeletonBar: {
    width: 22,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceMuted,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dangerBg ?? '#FEF2F2',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder ?? '#FECACA',
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.danger,
    marginRight: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retryText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  filtersWrapper: {
    marginBottom: theme.spacing.md,
  },
  filtersContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  filterPillActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  filterPillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.inkSecondary,
  },
  filterPillTextActive: {
    color: theme.colors.surface,
  },
  listHeader: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: theme.colors.ink,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.lg,
    marginBottom: 10,
    padding: 16,
    borderRadius: theme.radius.lg,
    ...theme.shadow.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  transactionMiddle: {
    flex: 1,
    justifyContent: 'center',
  },
  transactionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  transactionSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedLight,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: theme.fontSize.md,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.xs,
  },
  statusBadgeCompleted: {
    backgroundColor: theme.colors.successBg,
  },
  statusBadgePending: {
    backgroundColor: theme.colors.warningBg,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextCompleted: {
    color: theme.colors.success,
  },
  statusTextPending: {
    color: theme.colors.warning,
  },
  loadingContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.sm,
  },
  emptyContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
