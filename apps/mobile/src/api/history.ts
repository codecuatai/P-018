import { request } from './client';

// Shape của resource object trả về từ mỗi loại service
export interface HistoryResource {
  amount?: number;
  currency?: string;
  total?: { amount?: number; currency?: string };
  status?: string;
  // ride
  pickup_address?: string;
  dropoff_address?: string;
  vehicle_type?: string;
  // food
  restaurant_name?: string;
  // healthcare
  doctor_name?: string;
  department_name?: string;
  price?: number;
  // restaurant
  start_at?: string;
  party_size?: number;
}

export type HistoryItemType =
  | 'food_order'
  | 'ride_booking'
  | 'restaurant_reservation'
  | 'healthcare_appointment';

export interface HistoryItem {
  id: string;
  type: HistoryItemType;
  title: string;
  status: string;
  detail: string;
  timestamp: string;
  source: HistoryItemType;
  resource: HistoryResource;
}

export interface HistoryListResult {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  partial: boolean;
  unavailable: string[];
}

export interface HistoryListParams {
  service?: HistoryItemType;
  page?: number;
  page_size?: number;
  from?: string;
  to?: string;
}

export function listHistory(params?: HistoryListParams): Promise<HistoryListResult> {
  const query = new URLSearchParams();
  if (params?.service) query.set('service', params.service);
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const qs = query.toString();
  return request<HistoryListResult>(`/api/v1/history${qs ? `?${qs}` : ''}`);
}

/** Lấy amount thật từ resource của bất kỳ loại history item nào */
export function extractHistoryAmount(resource: HistoryResource): number {
  if (typeof resource.amount === 'number' && resource.amount > 0) return resource.amount;
  if (typeof resource.price === 'number' && resource.price > 0) return resource.price;
  if (typeof resource.total?.amount === 'number' && resource.total.amount > 0) return resource.total.amount;
  return 0;
}

/** Map HistoryItemType sang category label dùng trong ActivityScreen */
export function mapTypeToCategory(type: HistoryItemType): 'Ride' | 'Food' | 'Medical' | 'Other' {
  switch (type) {
    case 'ride_booking': return 'Ride';
    case 'food_order': return 'Food';
    case 'healthcare_appointment': return 'Medical';
    default: return 'Other';
  }
}
