import { request } from './client';

export interface SavedAddress {
  id: string;
  label: string;
  address_text: string;
  city?: string;
  district?: string;
  ward?: string;
  latitude?: number;
  longitude?: number;
  provider?: string;
  source: 'manual' | 'geocoded' | 'imported';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedAddressInput {
  label: string;
  address_text: string;
  city?: string;
  district?: string;
  ward?: string;
  latitude?: number;
  longitude?: number;
  source?: 'manual' | 'geocoded' | 'imported';
  is_default?: boolean;
}

export interface AutocompleteSuggestion {
  address_text: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  rank?: number;
}

export interface AddressListResult {
  items: SavedAddress[];
}

export function listAddresses(): Promise<AddressListResult> {
  return request<AddressListResult>('/api/v1/addresses');
}

export function createAddress(body: SavedAddressInput): Promise<SavedAddress> {
  return request<SavedAddress>('/api/v1/addresses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteAddress(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/addresses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export interface AutocompleteResult {
  provider: string;
  query: string;
  suggestions: AutocompleteSuggestion[];
}

export function autocompleteAddress(addressText: string): Promise<AutocompleteResult> {
  return request<AutocompleteResult>('/api/v1/location/autocomplete', {
    method: 'POST',
    body: JSON.stringify({ address_text: addressText }),
  });
}
