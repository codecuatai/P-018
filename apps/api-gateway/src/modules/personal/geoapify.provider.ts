import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeoCoordinate = { latitude: number; longitude: number };

export type GeoapifyGeocodeCandidate = {
  address_text: string;
  latitude: number;
  longitude: number;
  confidence: number;
  rank?: number;
  provider: 'geoapify';
};

export type GeoapifyRoute = {
  provider: 'geoapify';
  status: 'RESOLVED';
  distance_km: number;
  duration_minutes: number;
  origin: GeoCoordinate;
  destination: GeoCoordinate;
  route_distance_meters: number;
  route_duration_seconds: number;
  route_geometry: GeoCoordinate[];
  route_polyline: null;
  route_snapshot_hash: string;
};

export type GeoapifySuggestion = GeoapifyGeocodeCandidate;

type CacheEntry = { expiresAt: number; value: unknown };

@Injectable()
export class GeoapifyProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return String(this.config.get('GEOAPIFY_REAL_MODE') ?? 'false').toLowerCase() === 'true';
  }

  async geocode(query: string): Promise<GeoapifyGeocodeCandidate[]> {
    const normalized = normalizeText(query);
    const cacheKey = `geocode:${normalized}`;
    const cached = this.cached<GeoapifyGeocodeCandidate[]>(cacheKey);
    if (cached) return cached;

    let payload = await this.request('/geocode/search', {
      text: normalized,
      format: 'json',
      limit: '5',
    });
    let results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : [];
    let candidates = results.map((item) => parseGeocode(item)).filter((item): item is GeoapifyGeocodeCandidate => item !== undefined);
    const shortCode = shortCodeFromQuery(normalized);
    if (shortCode && (!candidates.length || !candidates.some((candidate) => candidateContainsCode(candidate, shortCode)))) {
      const semanticQuery = removeLeadingPlaceWord(removeShortCode(normalized));
      if (semanticQuery) {
        const suggestions = await this.autocomplete(semanticQuery);
        const semanticCandidate = selectSemanticCandidate(suggestions, semanticQuery);
        if (semanticCandidate) candidates = [semanticCandidate];
      }
    }
    if (!candidates.length) return [];
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value: candidates });
    return candidates;
  }

  async autocomplete(query: string): Promise<GeoapifySuggestion[]> {
    const normalized = normalizeText(query);
    const cacheKey = `autocomplete:${normalized}`;
    const cached = this.cached<GeoapifySuggestion[]>(cacheKey);
    if (cached) return cached;

    let payload = await this.request('/geocode/autocomplete', {
      text: normalized,
      limit: '10',
    });
    let features = isRecord(payload) && Array.isArray(payload.features) ? payload.features : [];
    let suggestions = features.map((item) => parseFeatureSuggestion(item)).filter((item): item is GeoapifySuggestion => item !== undefined);
    const transliterated = removeVietnameseMarks(normalized);
    if (!suggestions.length && transliterated !== normalized) {
      payload = await this.request('/geocode/autocomplete', {
        text: transliterated,
        limit: '10',
      });
      features = isRecord(payload) && Array.isArray(payload.features) ? payload.features : [];
      suggestions = features.map((item) => parseFeatureSuggestion(item)).filter((item): item is GeoapifySuggestion => item !== undefined);
    }
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value: suggestions });
    return suggestions;
  }

  async route(origin: GeoCoordinate, destination: GeoCoordinate, mode = 'drive'): Promise<GeoapifyRoute> {
    const cacheKey = `route:${mode}:${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}:${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
    const cached = this.cached<GeoapifyRoute>(cacheKey);
    if (cached) return cached;

    const payload = await this.request('/routing', {
      waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`,
      mode,
    }, false);
    const feature = isRecord(payload) && Array.isArray(payload.features) && isRecord(payload.features[0]) ? payload.features[0] : undefined;
    const properties = isRecord(feature?.properties) ? feature.properties : undefined;
    const distance = numberValue(properties?.distance);
    const duration = numberValue(properties?.time);
    const geometry = geometryPoints(feature?.geometry);
    if (distance === undefined || duration === undefined || distance <= 0 || duration <= 0 || geometry.length < 2) {
      throw geoapifyUnavailable('GEOAPIFY_INVALID_ROUTE');
    }
    const result: GeoapifyRoute = {
      provider: 'geoapify',
      status: 'RESOLVED',
      distance_km: Number((distance / 1000).toFixed(2)),
      duration_minutes: Math.max(1, Math.ceil(duration / 60)),
      origin,
      destination,
      route_distance_meters: Math.round(distance),
      route_duration_seconds: Math.round(duration),
      route_geometry: geometry,
      route_polyline: null,
      route_snapshot_hash: stableHash({ origin, destination, distance, duration, geometry }),
    };
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value: result });
    return result;
  }

  private cached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private async request(path: string, params: Record<string, string>, includeLocationFilters = true): Promise<unknown> {
    const baseUrl = normalizeBaseUrl(this.config.get<string>('GEOAPIFY_API_BASE_URL'));
    const apiKey = normalizeSecret(this.config.get<string>('GEOAPIFY_SERVER_API_KEY'));
    if (!apiKey || isPlaceholder(apiKey)) throw geoapifyUnavailable('GEOAPIFY_CONFIG_INVALID');
    const url = new URL(path.replace(/^\//, ''), `${baseUrl}/`);
    const searchParams = new URLSearchParams(params);
    if (includeLocationFilters) {
      searchParams.set('lang', String(this.config.get('GEOAPIFY_LANGUAGE') ?? 'vi'));
      searchParams.set('filter', `countrycode:${String(this.config.get('GEOAPIFY_COUNTRY_FILTER') ?? 'vn')}`);
      const bias = String(this.config.get('GEOAPIFY_LOCATION_BIAS') ?? '').trim();
      if (bias) searchParams.set('bias', bias);
    }
    searchParams.set('apiKey', apiKey);
    url.search = searchParams.toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('UPSTREAM_TIMEOUT_MS', 10000));
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw geoapifyUnavailable('GEOAPIFY_AUTH_FAILED');
        if (response.status === 429) throw geoapifyUnavailable('GEOAPIFY_QUOTA_EXCEEDED');
        throw geoapifyUnavailable('GEOAPIFY_UPSTREAM_ERROR');
      }
      return payload;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      throw geoapifyUnavailable('GEOAPIFY_RETRYABLE_FAILURE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function shortCodeFromQuery(value: string): string | undefined {
  const token = value.split(/\s+/).at(-1)?.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}-]+$/u, '');
  if (!token || !/^[A-Z][A-Z0-9-]{1,7}$/.test(token)) return undefined;
  return token;
}

function candidateContainsCode(candidate: GeoapifyGeocodeCandidate, code: string): boolean {
  return candidate.address_text.toUpperCase().split(/[^A-Z0-9-]+/).includes(code);
}

function removeShortCode(value: string): string {
  const tokens = value.split(/\s+/);
  return tokens.slice(0, -1).join(' ').trim();
}

function removeLeadingPlaceWord(value: string): string {
  return value.replace(/^(?:trường|truong|school)\s+/iu, '').trim();
}

function selectSemanticCandidate(suggestions: GeoapifySuggestion[], query: string): GeoapifySuggestion | undefined {
  const semanticPhrase = foldForMatching(query);
  if (!semanticPhrase) return undefined;
  const exact = suggestions.find((suggestion) => {
    const label = foldForMatching(suggestion.address_text.split(',')[0] ?? '')
      .replace(/^(?:truong|school)\s+/, '')
      .trim();
    return label === semanticPhrase;
  });
  return exact ?? suggestions.find((suggestion) => foldForMatching(suggestion.address_text).includes(semanticPhrase));
}

function foldForMatching(value: string): string {
  return removeVietnameseMarks(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function removeVietnameseMarks(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, (character) => character === 'Đ' ? 'D' : 'd');
}

function normalizeSecret(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isPlaceholder(value: string): boolean {
  return value === '' || value.includes('__PASTE_') || value.toLowerCase().includes('replace_me');
}

function normalizeBaseUrl(value: string | undefined): string {
  const fallback = 'https://api.geoapify.com/v1';
  const raw = (value ?? fallback).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return fallback;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function parseGeocode(value: unknown): GeoapifyGeocodeCandidate | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = numberValue(value.lat);
  const longitude = numberValue(value.lon);
  const addressText = stringValue(value.formatted);
  if (latitude === undefined || longitude === undefined || !addressText || !validCoordinate({ latitude, longitude })) return undefined;
  return { address_text: addressText, latitude, longitude, confidence: numberValue(value.rank) ?? 1, ...(numberValue(value.rank) !== undefined ? { rank: numberValue(value.rank) } : {}), provider: 'geoapify' };
}

function parseFeatureSuggestion(value: unknown): GeoapifySuggestion | undefined {
  if (!isRecord(value)) return undefined;
  const properties = isRecord(value.properties) ? value.properties : {};
  const geometry = isRecord(value.geometry) ? value.geometry : {};
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const longitude = numberValue(properties.lon) ?? numberValue(coordinates[0]);
  const latitude = numberValue(properties.lat) ?? numberValue(coordinates[1]);
  const addressText = stringValue(properties.formatted);
  if (latitude === undefined || longitude === undefined || !addressText || !validCoordinate({ latitude, longitude })) return undefined;
  return { address_text: addressText, latitude, longitude, confidence: numberValue(properties.rank) ?? 1, ...(numberValue(properties.rank) !== undefined ? { rank: numberValue(properties.rank) } : {}), provider: 'geoapify' };
}

function geometryPoints(value: unknown): GeoCoordinate[] {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return [];
  const points: GeoCoordinate[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      const point = { latitude: node[1], longitude: node[0] };
      const previous = points[points.length - 1];
      if (validCoordinate(point) && (previous?.latitude !== point.latitude || previous.longitude !== point.longitude)) points.push(point);
      return;
    }
    if (Array.isArray(node)) node.forEach(visit);
  };
  visit(value.coordinates);
  return points;
}

function geoapifyUnavailable(code: string): BadGatewayException {
  return new BadGatewayException({ code, detail: 'Hiện mình chưa lấy được vị trí/đường đi. Bạn thử lại giúp mình nhé.', retryable: true });
}

function validCoordinate(value: GeoCoordinate): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableHash(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) hash = ((hash << 5) - hash + serialized.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(16).padStart(8, '0');
}
