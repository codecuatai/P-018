import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  listHistory,
  extractHistoryAmount,
  mapTypeToCategory,
  type HistoryItem,
} from '../api/history';
import { theme } from '../theme';

export type TimeRange = 'Daily' | 'Weekly' | 'Monthly';

export interface ChartBarItem {
  value: number;
  label: string;
  frontColor?: string;
}

/** Tổng hợp số tiền từ danh sách history item theo khoảng thời gian */
function aggregateByPeriod(items: HistoryItem[], range: TimeRange): ChartBarItem[] {
  const now = new Date();

  if (range === 'Daily') {
    // 7 ngày gần nhất (Mon → Sun hoặc T2 → CN)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const buckets = new Array<number>(7).fill(0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);

    for (const item of items) {
      const ts = new Date(item.timestamp);
      if (ts < cutoff) continue;
      const dayIndex = ts.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const bucketIndex = dayIndex === 0 ? 6 : dayIndex - 1; // Sun→6, Mon→0
      buckets[bucketIndex] += extractHistoryAmount(item.resource);
    }

    const maxIndex = buckets.indexOf(Math.max(...buckets));
    return dayLabels.map((label, i) => ({
      value: Math.round(buckets[i]),
      label,
      ...(i === maxIndex && buckets[i] > 0 ? { frontColor: theme.colors.primary } : {}),
    }));
  }

  if (range === 'Weekly') {
    // 4 tuần gần nhất
    const buckets = new Array<number>(4).fill(0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 27);
    cutoff.setHours(0, 0, 0, 0);

    for (const item of items) {
      const ts = new Date(item.timestamp);
      if (ts < cutoff) continue;
      const diffDays = Math.floor((now.getTime() - ts.getTime()) / 86400000);
      const weekIndex = Math.min(3, Math.floor(diffDays / 7));
      buckets[3 - weekIndex] += extractHistoryAmount(item.resource);
    }

    const maxIndex = buckets.indexOf(Math.max(...buckets));
    return ['W1', 'W2', 'W3', 'W4'].map((label, i) => ({
      value: Math.round(buckets[i]),
      label,
      ...(i === maxIndex && buckets[i] > 0 ? { frontColor: theme.colors.primary } : {}),
    }));
  }

  // Monthly — 5 tháng gần nhất
  const buckets = new Array<number>(5).fill(0);
  const monthLabels: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleString('en-US', { month: 'short' }));
  }

  for (const item of items) {
    const ts = new Date(item.timestamp);
    for (let i = 0; i < 5; i++) {
      const target = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
      const targetEnd = new Date(now.getFullYear(), now.getMonth() - (4 - i) + 1, 1);
      if (ts >= target && ts < targetEnd) {
        buckets[i] += extractHistoryAmount(item.resource);
        break;
      }
    }
  }

  const maxIndex = buckets.indexOf(Math.max(...buckets));
  return monthLabels.map((label, i) => ({
    value: Math.round(buckets[i]),
    label,
    ...(i === maxIndex && buckets[i] > 0 ? { frontColor: theme.colors.primary } : {}),
  }));
}

export interface ActivityDisplayItem {
  id: string;
  title: string;
  reference: string;
  status: string;
  detail: 'Ride' | 'Food' | 'Medical' | 'Other';
  timestamp: string;
  amount: number;
  currency: string;
}

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listHistory({ page_size: 100 });
      setItems(result.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải lịch sử giao dịch.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const getChartData = useCallback(
    (range: TimeRange): ChartBarItem[] => aggregateByPeriod(items, range),
    [items],
  );

  const displayItems = useMemo((): ActivityDisplayItem[] =>
    items.map((item: HistoryItem) => ({
      id: item.id,
      title: item.title,
      reference: item.detail,
      status: item.status,
      detail: mapTypeToCategory(item.type),
      timestamp: item.timestamp,
      amount: extractHistoryAmount(item.resource),
      currency: item.resource.currency ?? item.resource.total?.currency ?? 'VND',
    })),
    [items],
  );

  return {
    items,
    displayItems,
    loading,
    error,
    refresh: fetch,
    getChartData,
    isEmpty: !loading && items.length === 0,
  };
}
