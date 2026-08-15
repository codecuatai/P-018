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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';
import { Car, Utensils, Stethoscope, BedDouble, ReceiptText } from 'lucide-react-native';
import { theme } from '../theme';
import type { SessionActivity } from '../types';

interface ActivityScreenProps {
  activities: SessionActivity[];
  onOpenChat: () => void;
}

type TimeRange = 'Daily' | 'Weekly' | 'Monthly';
type FilterType = 'All' | 'Ride' | 'Food' | 'Hotel' | 'Medical';

// Mock data for charts
const chartDataDaily = [
  { value: 120000, label: 'Mon' },
  { value: 250000, label: 'Tue' },
  { value: 80000, label: 'Wed' },
  { value: 450000, label: 'Thu', frontColor: theme.colors.primary }, // Peak
  { value: 150000, label: 'Fri' },
  { value: 300000, label: 'Sat' },
  { value: 180000, label: 'Sun' },
];

const chartDataWeekly = [
  { value: 1200000, label: 'W1' },
  { value: 850000, label: 'W2' },
  { value: 1500000, label: 'W3', frontColor: theme.colors.primary },
  { value: 900000, label: 'W4' },
];

const chartDataMonthly = [
  { value: 4500000, label: 'Jan' },
  { value: 3200000, label: 'Feb' },
  { value: 5800000, label: 'Mar', frontColor: theme.colors.primary },
  { value: 4100000, label: 'Apr' },
  { value: 3900000, label: 'May' },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export function ActivityScreen({ activities, onOpenChat }: ActivityScreenProps) {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);
  
  const [timeRange, setTimeRange] = useState<TimeRange>('Weekly');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  // Compute chart data
  const currentChartData = useMemo(() => {
    switch (timeRange) {
      case 'Daily': return chartDataDaily;
      case 'Monthly': return chartDataMonthly;
      case 'Weekly':
      default:
        return chartDataWeekly;
    }
  }, [timeRange]);

  const totalSpent = useMemo(() => {
    return currentChartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [currentChartData]);

  // Combine real activities with some mock data for empty states if needed
  const displayActivities = useMemo(() => {
    if (activities.length === 0) {
      // Mock history for visual demo if empty
      return [
        { id: '1', title: 'Ride to Airport', reference: 'VinFast VF8', status: 'Completed', detail: 'Ride', timestamp: new Date().toISOString(), amount: 150000 },
        { id: '2', title: 'Sushi Hokkaido Sachi', reference: 'Dinner for 2', status: 'Completed', detail: 'Food', timestamp: new Date(Date.now() - 86400000).toISOString(), amount: 850000 },
        { id: '3', title: 'General Checkup', reference: 'Dr. Nguyen', status: 'Pending', detail: 'Medical', timestamp: new Date(Date.now() - 172800000).toISOString(), amount: 450000 },
      ];
    }
    return activities.map(a => ({
      ...a,
      amount: Math.floor(Math.random() * 500000) + 50000, // Mock amount for real activities
      detail: a.title.toLowerCase().includes('xe') ? 'Ride' :
              a.title.toLowerCase().includes('nhà hàng') || a.title.toLowerCase().includes('đồ ăn') || a.title.toLowerCase().includes('phở') ? 'Food' :
              a.title.toLowerCase().includes('khám') ? 'Medical' : 'Other'
    }));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    if (activeFilter === 'All') return displayActivities;
    return displayActivities.filter(a => a.detail === activeFilter);
  }, [displayActivities, activeFilter]);

  const renderFilterPill = (filter: FilterType, label: string) => {
    const isActive = activeFilter === filter;
    return (
      <TouchableOpacity
        style={[styles.filterPill, isActive && styles.filterPillActive]}
        onPress={() => setActiveFilter(filter)}
        activeOpacity={0.7}
      >
        <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const getIconForCategory = (category: string) => {
    switch (category) {
      case 'Ride': return <Car size={20} color={theme.colors.ride} />;
      case 'Food': return <Utensils size={20} color={theme.colors.food} />;
      case 'Medical': return <Stethoscope size={20} color={theme.colors.healthcare} />;
      case 'Hotel': return <BedDouble size={20} color={theme.colors.warning} />;
      default: return <ReceiptText size={20} color={theme.colors.primary} />;
    }
  };

  const getColorForCategory = (category: string) => {
    switch (category) {
      case 'Ride': return theme.colors.rideBg;
      case 'Food': return theme.colors.foodBg;
      case 'Medical': return theme.colors.healthcareBg;
      case 'Hotel': return theme.colors.warningBg;
      default: return theme.colors.primaryLight;
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <FlatList
        data={filteredActivities}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
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
                <Text style={styles.summaryAmount}>{formatCurrency(totalSpent)}</Text>
                
                <View style={styles.chartWrapper}>
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
                    maxValue={Math.max(...currentChartData.map(d => d.value)) * 1.2}
                    frontColor={theme.colors.surfaceMuted}
                    initialSpacing={10}
                    height={140}
                  />
                </View>
              </View>
            </View>

            {/* Filter Pills */}
            <View style={styles.filtersWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
                {renderFilterPill('All', 'All')}
                {renderFilterPill('Ride', 'Rides')}
                {renderFilterPill('Food', 'Dining & Food')}
                {renderFilterPill('Medical', 'Health')}
                {renderFilterPill('Hotel', 'Hotels')}
              </ScrollView>
            </View>
            
            <Text style={styles.listHeader}>Recent Transactions</Text>
          </>
        }
        renderItem={({ item }) => {
          const isCompleted = item.status === 'Completed';
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
                <Text style={styles.transactionAmount}>-{formatCurrency(item.amount || 0)}</Text>
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transactions found for this category.</Text>
          </View>
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
    marginLeft: -20, // adjust chart alignment
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
  emptyContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.sm,
  }
});
