import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { HealthcareClient } from '../../clients/service.clients';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { CoreModule, CoreStore, SavedAddressPatch, SavedAddressRecord } from '../core/core.module';
import { AuthModule } from '../auth/auth.module';
import { GeoapifyProvider } from './geoapify.provider';

export class ProfilePatchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => typeof value === 'string' ? normalizePhone(value) : value)
  @Matches(/^(?:(?:0|\+84)(?:3|5|7|8|9)\d{8})?$/, { message: 'Số điện thoại Việt Nam không hợp lệ.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  onboarding_completed?: boolean;
}

class SavedAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  address_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ward?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsIn(['manual', 'geocoded', 'imported'])
  source?: SavedAddressRecord['source'];

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

class SavedAddressPatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  address_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ward?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsIn(['manual', 'geocoded', 'imported'])
  source?: SavedAddressRecord['source'];

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

class PatientCreateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  @Transform(({ value }) => typeof value === 'string' ? normalizePhone(value) : value)
  @Matches(/^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/, { message: 'Số điện thoại Việt Nam không hợp lệ.' })
  phone!: string;

  @IsOptional()
  @IsIn(['self', 'child', 'parent', 'dependent'])
  relationship?: 'self' | 'child' | 'parent' | 'dependent';

  @IsOptional()
  @IsString()
  @MaxLength(16)
  blood_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medical_history?: string;
}

class PatientPatchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  @Transform(({ value }) => typeof value === 'string' ? normalizePhone(value) : value)
  @Matches(/^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/, { message: 'Số điện thoại Việt Nam không hợp lệ.' })
  phone?: string;

  @IsOptional()
  @IsIn(['self', 'child', 'parent', 'dependent'])
  relationship?: 'self' | 'child' | 'parent' | 'dependent';
}

export interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

type GeocodeCandidate = {
  address_text: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
};

type GeocodeResult = {
  provider: string;
  status: 'RESOLVED' | 'NEEDS_CONFIRMATION';
  query: string;
  candidates: GeocodeCandidate[];
  retryable?: boolean;
};

type RouteResult = {
  provider: string;
  status: 'RESOLVED' | 'ESTIMATED';
  distance_km: number;
  duration_minutes: number;
  origin: LocationCoordinate;
  destination: LocationCoordinate;
  route_distance_meters?: number;
  route_duration_seconds?: number;
  route_polyline?: string | null;
  route_geometry?: LocationCoordinate[];
  route_snapshot_hash?: string;
  retryable?: boolean;
};

function routeGeometryFromGeoJson(value: unknown): LocationCoordinate[] {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return [];
  const points: LocationCoordinate[] = [];
  const append = (candidate: unknown): void => {
    if (Array.isArray(candidate) && typeof candidate[0] === 'number' && typeof candidate[1] === 'number') {
      const longitude = candidate[0];
      const latitude = candidate[1];
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        points.push({ latitude, longitude });
      }
      return;
    }
    if (Array.isArray(candidate)) candidate.forEach(append);
  };
  append(value.coordinates);
  return points;
}

type AutocompleteResult = {
  provider: string;
  query: string;
  suggestions: Array<GeocodeCandidate & { rank?: number }>;
  retryable?: boolean;
};

@Injectable()
export class LocationService {
  constructor(private readonly config: ConfigService, private readonly geoapify: GeoapifyProvider) {}

  get realMode(): boolean {
    return this.geoapify.enabled;
  }

  async geocode(addressText: string): Promise<GeocodeResult> {
    const query = addressText.trim().replace(/\s+/g, ' ');
    if (this.geoapify.enabled) {
      const candidates = await this.geoapify.geocode(query);
      return {
        provider: 'geoapify',
        status: candidates.length ? 'RESOLVED' : 'NEEDS_CONFIRMATION',
        query,
        candidates: candidates.map((candidate) => ({ address_text: candidate.address_text, latitude: candidate.latitude, longitude: candidate.longitude, confidence: candidate.confidence })),
      };
    }
    if (query.length < 3) throw new BadRequestException({ code: 'ADDRESS_TOO_SHORT', detail: 'Địa chỉ cần ít nhất 3 ký tự.', retryable: false });

    const providerUrl = this.geocodingProviderUrl();
    if (!providerUrl) {
      const localCandidate = this.localDeterministicCandidate(query);
      if (localCandidate) return { provider: 'deterministic-local-demo', status: 'RESOLVED', query, candidates: [localCandidate] };
      return { provider: 'deterministic-manual', status: 'NEEDS_CONFIRMATION', query, candidates: [{ address_text: query, latitude: null, longitude: null, confidence: 0 }] };
    }

    try {
      const url = new URL('/search', providerUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '3');
      const payload = await this.fetchJson(url, 'GEOCODING_PROVIDER_TOKEN');
      const candidates = Array.isArray(payload)
        ? payload.map((item) => this.parseGeocodeCandidate(item)).filter((item): item is GeocodeCandidate => item !== undefined)
        : [];
      if (candidates.length) return { provider: 'configured-geocoding-provider', status: 'RESOLVED', query, candidates };
      return { provider: 'configured-geocoding-provider', status: 'NEEDS_CONFIRMATION', query, candidates: [{ address_text: query, latitude: null, longitude: null, confidence: 0 }] };
    } catch {
      return { provider: 'configured-geocoding-provider-unavailable', status: 'NEEDS_CONFIRMATION', query, candidates: [{ address_text: query, latitude: null, longitude: null, confidence: 0 }], retryable: true };
    }
  }

  async reverseGeocode(coordinate: LocationCoordinate): Promise<GeocodeResult> {
    assertCoordinate(coordinate, 'location');
    if (this.geoapify.enabled) {
      const candidates = await this.geoapify.reverse(coordinate);
      return {
        provider: 'geoapify',
        status: candidates.length ? 'RESOLVED' : 'NEEDS_CONFIRMATION',
        query: `${coordinate.latitude},${coordinate.longitude}`,
        candidates: candidates.map((candidate) => ({ address_text: candidate.address_text, latitude: candidate.latitude, longitude: candidate.longitude, confidence: candidate.confidence })),
      };
    }

    const providerUrl = this.geocodingProviderUrl();
    if (!providerUrl) {
      return { provider: 'manual-reverse-geocoding', status: 'NEEDS_CONFIRMATION', query: `${coordinate.latitude},${coordinate.longitude}`, candidates: [] };
    }

    try {
      const url = new URL('/reverse', providerUrl);
      url.searchParams.set('lat', String(coordinate.latitude));
      url.searchParams.set('lon', String(coordinate.longitude));
      url.searchParams.set('format', 'jsonv2');
      const payload = await this.fetchJson(url, 'GEOCODING_PROVIDER_TOKEN');
      const candidate = this.parseGeocodeCandidate(payload);
      return { provider: 'configured-geocoding-provider', status: candidate ? 'RESOLVED' : 'NEEDS_CONFIRMATION', query: `${coordinate.latitude},${coordinate.longitude}`, candidates: candidate ? [candidate] : [] };
    } catch {
      return { provider: 'configured-geocoding-provider-unavailable', status: 'NEEDS_CONFIRMATION', query: `${coordinate.latitude},${coordinate.longitude}`, candidates: [], retryable: true };
    }
  }

  async route(origin: LocationCoordinate, destination: LocationCoordinate): Promise<RouteResult> {
    assertCoordinate(origin, 'origin');
    assertCoordinate(destination, 'destination');
    if (this.geoapify.enabled) return this.geoapify.route(origin, destination);
    const providerUrl = this.routingProviderUrl();
    if (providerUrl) {
      try {
        const url = new URL(`/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`, providerUrl);
        url.searchParams.set('overview', 'full');
        // The Ride domain requires auditable geometry, not only a distance or
        // an opaque encoded line. OSRM-compatible providers can return the
        // route as GeoJSON, which is normalized below into our typed points.
        url.searchParams.set('geometries', 'geojson');
        const payload = await this.fetchRoutingJson(url);
        const route = isRecord(payload) && Array.isArray(payload.routes) && isRecord(payload.routes[0]) ? payload.routes[0] : undefined;
        const distanceMeters = numberValue(route?.distance);
        const durationSeconds = numberValue(route?.duration);
        const routeGeometry = routeGeometryFromGeoJson(route?.geometry);
        if (distanceMeters !== undefined && durationSeconds !== undefined && routeGeometry.length >= 2) {
          return {
            provider: 'configured-routing-provider',
            status: 'RESOLVED',
            distance_km: Number((distanceMeters / 1000).toFixed(2)),
            duration_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
            origin,
            destination,
            route_distance_meters: Math.round(distanceMeters),
            route_duration_seconds: Math.round(durationSeconds),
            route_geometry: routeGeometry,
            route_snapshot_hash: stableHash({ origin, destination, distanceMeters, durationSeconds, routeGeometry }),
          };
        }
      } catch {
        // Fall through to a transparent estimate. No provider response is
        // authoritative until it passes the shape and numeric checks above.
      }
    }
    const distance = haversineKm(origin, destination);
    if (!providerUrl) {
      // Local/demo mode still needs to satisfy the same auditable route
      // contract as a real provider so the ride quote flow can be exercised
      // without making a network call. Keep the estimate deterministic and
      // explicit about its provider instead of returning an incomplete route.
      const distanceMeters = Math.max(1, Math.round(distance * 1000));
      const durationSeconds = Math.max(60, Math.round(distance / 22 * 3600));
      const routeGeometry = [origin, destination];
      return {
        provider: 'deterministic-straight-line',
        status: 'RESOLVED',
        distance_km: Number(distance.toFixed(2)),
        duration_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        origin,
        destination,
        route_distance_meters: distanceMeters,
        route_duration_seconds: durationSeconds,
        route_geometry: routeGeometry,
        route_snapshot_hash: stableHash({ origin, destination, distanceMeters, durationSeconds, routeGeometry, mode: 'straight-line' }),
      };
    }
    return {
      provider: 'configured-routing-provider-unavailable',
      status: 'ESTIMATED',
      distance_km: Number(distance.toFixed(2)),
      duration_minutes: Math.max(1, Math.ceil(distance / 22 * 60)),
      origin,
      destination,
      route_snapshot_hash: stableHash({ origin, destination, distance_km: Number(distance.toFixed(2)), mode: 'straight-line' }),
      ...(providerUrl ? { retryable: true } : {}),
    };
  }

  async autocomplete(addressText: string): Promise<AutocompleteResult> {
    const query = addressText.trim().replace(/\s+/g, ' ');
    if (query.length < 3) throw new BadRequestException({ code: 'ADDRESS_TOO_SHORT', detail: 'Address query is too short.', retryable: false });
    if (this.geoapify.enabled) {
      const suggestions = await this.geoapify.autocomplete(query);
      if (suggestions.length) return { provider: 'geoapify', query, suggestions };
    }
    const local = this.localDeterministicSuggestions(query);
    if (local.length) {
      return { provider: 'deterministic-local-demo', query, suggestions: local };
    }
    const result = await this.geocode(query);
    return { provider: result.provider, query, suggestions: result.candidates };
  }

  private geocodingProviderUrl(): URL | undefined { return this.configuredProviderUrl('GEOCODING_PROVIDER_URL'); }
  private routingProviderUrl(): URL | undefined { return this.configuredProviderUrl('ROUTING_PROVIDER_URL'); }

  private localDeterministicCandidate(query: string): GeocodeCandidate | undefined {
    if (this.config.get<boolean>('LOCAL_DETERMINISTIC_LOCATION_FALLBACK') !== true || this.config.get<string>('APP_ENV') === 'production') return undefined;
    const normalized = foldLocalAddress(query);
    const fixtures: Array<{ matches: string[]; formatted?: string; latitude: number; longitude: number }> = [
      { matches: ['noi bai', 'san bay noi bai', 'noi bai international airport'], formatted: 'Cảng hàng không quốc tế Nội Bài, Sóc Sơn, Hà Nội', latitude: 21.2187, longitude: 105.8042 },
      { matches: ['ho hoan kiem', 'ho guom'], formatted: 'Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội', latitude: 21.0285, longitude: 105.8048 },
      { matches: ['cong vien nghia do', 'nghia do'], formatted: 'Công viên Nghĩa Đô, Cầu Giấy, Hà Nội', latitude: 21.0456, longitude: 105.7939 },
      { matches: ['vinuni', 'vinhomes ocean park'], formatted: 'VinUniversity, Vinhomes Ocean Park, Gia Lâm, Hà Nội', latitude: 20.9914, longitude: 105.945975 },
      { matches: ['12 nguyen hue', 'nguyen hue quan 1', 'quan 1'], formatted: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh', latitude: 10.7758, longitude: 106.7004 },
      { matches: ['51 tam khuong', 'tam khuong', '51 5am', 'khuong thuong', 'dong da'], formatted: '51 Phố Tam Khương, Phường Khương Thượng, Quận Đống Đa, Hà Nội', latitude: 21.0062, longitude: 105.8286 },
      { matches: ['chua boc', 'quang trung'], formatted: 'Chùa Bộc, Phường Quang Trung, Quận Đống Đa, Hà Nội', latitude: 21.0078, longitude: 105.8282 },
      { matches: ['tay son', 'nga tu so'], formatted: 'Tây Sơn, Phường Ngã Tư Sở, Quận Đống Đa, Hà Nội', latitude: 21.0112, longitude: 105.8235 },
      { matches: ['thai ha', 'trung liet'], formatted: 'Thái Hà, Phường Trung Liệt, Quận Đống Đa, Hà Nội', latitude: 21.0135, longitude: 105.8198 },
      { matches: ['nguyen trai', 'thanh xuan'], formatted: 'Nguyễn Trãi, Quận Thanh Xuân, Hà Nội', latitude: 20.9984, longitude: 105.8123 },
      { matches: ['cau giay', 'xuan thuy', 'duy tan'], formatted: 'Cầu Giấy, Quận Cầu Giấy, Hà Nội', latitude: 21.0333, longitude: 105.7939 },
      { matches: ['ba dinh', 'ngoc ha', '34 ngoc ha', 'doi can'], formatted: '34 Ngọc Hà, Phường Ngọc Hà, Quận Ba Đình, Hà Nội', latitude: 21.0378, longitude: 105.8315 },
    ];
    const fixture = fixtures.find((item) => item.matches.some((value) => normalized === value || normalized.includes(` ${value} `) || normalized.startsWith(`${value} `) || normalized.endsWith(` ${value}`) || normalized.includes(value) || value.includes(normalized)));
    return fixture ? { address_text: fixture.formatted ?? query, latitude: fixture.latitude, longitude: fixture.longitude, confidence: 0.5 } : undefined;
  }

  private localDeterministicSuggestions(query: string): GeocodeCandidate[] {
    if (this.config.get<boolean>('LOCAL_DETERMINISTIC_LOCATION_FALLBACK') !== true || this.config.get<string>('APP_ENV') === 'production') return [];
    const normalized = foldLocalAddress(query);
    const fixtures: Array<{ matches: string[]; formatted: string; latitude: number; longitude: number }> = [
      { matches: ['noi bai', 'san bay noi bai', 'noi bai international airport'], formatted: 'Cảng hàng không quốc tế Nội Bài, Sóc Sơn, Hà Nội', latitude: 21.2187, longitude: 105.8042 },
      { matches: ['51 tam khuong', 'tam khuong', '51 5am', 'khuong thuong', 'dong da'], formatted: '51 Phố Tam Khương, Phường Khương Thượng, Quận Đống Đa, Hà Nội', latitude: 21.0062, longitude: 105.8286 },
      { matches: ['chua boc', 'quang trung'], formatted: 'Chùa Bộc, Phường Quang Trung, Quận Đống Đa, Hà Nội', latitude: 21.0078, longitude: 105.8282 },
      { matches: ['tay son', 'nga tu so'], formatted: 'Tây Sơn, Phường Ngã Tư Sở, Quận Đống Đa, Hà Nội', latitude: 21.0112, longitude: 105.8235 },
      { matches: ['thai ha', 'trung liet'], formatted: 'Thái Hà, Phường Trung Liệt, Quận Đống Đa, Hà Nội', latitude: 21.0135, longitude: 105.8198 },
      { matches: ['ho hoan kiem', 'ho guom', 'hoan kiem'], formatted: 'Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội', latitude: 21.0285, longitude: 105.8542 },
      { matches: ['12 nguyen hue', 'nguyen hue quan 1', 'quan 1', 'nguyen hue'], formatted: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh', latitude: 10.7758, longitude: 106.7004 },
      { matches: ['nguyen trai', 'thanh xuan'], formatted: 'Nguyễn Trãi, Quận Thanh Xuân, Hà Nội', latitude: 20.9984, longitude: 105.8123 },
      { matches: ['cau giay', 'xuan thuy', 'duy tan'], formatted: 'Cầu Giấy, Quận Cầu Giấy, Hà Nội', latitude: 21.0333, longitude: 105.7939 },
      { matches: ['ba dinh', 'ngoc ha', '34 ngoc ha', 'doi can'], formatted: '34 Ngọc Hà, Phường Ngọc Hà, Quận Ba Đình, Hà Nội', latitude: 21.0378, longitude: 105.8315 },
      { matches: ['vinuni', 'vinhomes ocean park', 'gia lam'], formatted: 'VinUniversity, Vinhomes Ocean Park, Gia Lâm, Hà Nội', latitude: 20.9914, longitude: 105.945975 },
    ];
    const matches = fixtures.filter((item) => item.matches.some((value) => normalized === value || normalized.includes(value) || value.includes(normalized)) || foldLocalAddress(item.formatted).includes(normalized));
    if (matches.length > 0) {
      return matches.map((item) => ({ address_text: item.formatted, latitude: item.latitude, longitude: item.longitude, confidence: 0.9 }));
    }
    const single = this.localDeterministicCandidate(query);
    if (single) return [single];
    const hash = Math.abs(normalized.split('').reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0));
    const deltaLat = ((hash % 1000) / 1000 - 0.5) * 0.04;
    const deltaLng = (((hash >> 3) % 1000) / 1000 - 0.5) * 0.04;
    return [{
      address_text: `${query.trim()}, Hà Nội`,
      latitude: Number((21.0285 + deltaLat).toFixed(6)),
      longitude: Number((105.8542 + deltaLng).toFixed(6)),
      confidence: 0.6,
    }];
  }

  private configuredProviderUrl(name: 'GEOCODING_PROVIDER_URL' | 'ROUTING_PROVIDER_URL'): URL | undefined {
    const configured = this.config.get<string>(name)?.trim() || this.config.get<string>('LOCATION_PROVIDER_URL')?.trim();
    if (!configured) return undefined;
    try {
      return new URL(configured.endsWith('/') ? configured : `${configured}/`);
    } catch {
      return undefined;
    }
  }

  private async fetchJson(url: URL, tokenName: 'GEOCODING_PROVIDER_TOKEN' | 'ROUTING_PROVIDER_TOKEN'): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('UPSTREAM_TIMEOUT_MS', 5000));
    try {
      const token = this.config.get<string>(tokenName)?.trim() || this.config.get<string>('LOCATION_PROVIDER_TOKEN')?.trim();
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error('location-provider-http-error');
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchRoutingJson(url: URL): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchJson(url, 'ROUTING_PROVIDER_TOKEN');
      } catch (error) {
        if (attempt === 1) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('Routing provider request did not produce a result.');
  }

  private parseGeocodeCandidate(value: unknown): GeocodeCandidate | undefined {
    if (!isRecord(value)) return undefined;
    const latitude = numberValue(value.lat);
    const longitude = numberValue(value.lon);
    const addressText = stringValue(value.display_name);
    if (latitude === undefined || longitude === undefined || !addressText || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
    return { address_text: addressText, latitude, longitude, confidence: 1 };
  }
}

@Controller('api/v1/users')
@UseGuards(AuthGuard)
export class PersonalProfileController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  get(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    return { data: request.user, meta: { request_id: request.correlationId } };
  }

  @Patch('me')
  async patch(@Body() body: ProfilePatchDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const updated = await this.auth.updateProfile(request.user, {
      ...(body.full_name !== undefined ? { fullName: body.full_name.trim() } : {}),
      ...(body.phone !== undefined ? { phone: normalizePhone(body.phone) } : {}),
      ...(body.avatar_url !== undefined ? { avatarUrl: body.avatar_url.trim() } : {}),
      ...(body.language !== undefined ? { language: body.language.trim() } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone.trim() } : {}),
      ...(body.onboarding_completed !== undefined ? { onboardingCompletedAt: body.onboarding_completed ? new Date().toISOString() : '' } : {}),
    });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const allowed = ['image/jpeg', 'image/png', 'image/webp']; cb(null, allowed.includes(file.mimetype)); } }))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!file) throw new BadRequestException({ code: 'AVATAR_REQUIRED', detail: 'Vui lòng chọn ảnh đại diện (JPG, PNG, hoặc WebP, tối đa 5MB).', retryable: false });
    const avatarUrl = file.size < 100 * 1024
      ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      : `https://avatars.example.com/${request.user.sub}/avatar.png`;
    const updated = await this.auth.updateProfile(request.user, { avatarUrl });
    return { data: { avatar_url: updated.avatar_url ?? avatarUrl }, meta: { request_id: request.correlationId } };
  }
}

@Controller('api/v1/addresses')
@UseGuards(AuthGuard)
export class SavedAddressController {
  constructor(private readonly store: CoreStore, private readonly locations: LocationService) {}

  @Get()
  async list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: { items: (await this.store.listSavedAddresses(request.user.sub)).map(toPublicAddress) }, meta: { request_id: request.correlationId } };
  }

  @Post()
  async create(@Body() body: SavedAddressDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    assertCoordinatePair(body.latitude, body.longitude);
    const latitude = roundCoordinate(body.latitude);
    const longitude = roundCoordinate(body.longitude);
    const now = new Date().toISOString();
    const saved = await this.store.createSavedAddress({ id: `addr_${randomUUID().replaceAll('-', '').slice(0, 16)}`, actorId: request.user.sub, label: body.label.trim(), addressText: body.address_text.trim(), city: clean(body.city), district: clean(body.district), ward: clean(body.ward), latitude, longitude, provider: clean(body.provider), source: body.source ?? 'manual', isDefault: body.is_default === true, createdAt: now, updatedAt: now });
    return { data: toPublicAddress(saved), meta: { request_id: request.correlationId } };
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: SavedAddressPatchDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    assertCoordinatePair(body.latitude, body.longitude);
    const latitude = roundCoordinate(body.latitude);
    const longitude = roundCoordinate(body.longitude);
    const current = await this.store.getSavedAddress(id, request.user.sub);
    if (!current) throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', detail: 'Không tìm thấy địa chỉ thuộc tài khoản hiện tại.', retryable: false });
    const nextAddressText = body.address_text?.trim();
    const addressChanged = nextAddressText !== undefined && nextAddressText !== current.addressText;
    const patch: SavedAddressPatch = {
      ...(body.label !== undefined ? { label: body.label.trim() } : {}),
      ...(nextAddressText !== undefined ? { addressText: nextAddressText } : {}),
      ...(body.city !== undefined ? { city: clean(body.city) ?? null } : addressChanged ? { city: null } : {}),
      ...(body.district !== undefined ? { district: clean(body.district) ?? null } : addressChanged ? { district: null } : {}),
      ...(body.ward !== undefined ? { ward: clean(body.ward) ?? null } : addressChanged ? { ward: null } : {}),
      ...(body.latitude !== undefined ? { latitude } : addressChanged ? { latitude: null } : {}),
      ...(body.longitude !== undefined ? { longitude } : addressChanged ? { longitude: null } : {}),
      ...(body.provider !== undefined ? { provider: clean(body.provider) ?? null } : addressChanged ? { provider: null } : {}),
      ...(body.source !== undefined ? { source: body.source } : addressChanged ? { source: body.latitude !== undefined ? 'geocoded' : 'manual' } : {}),
      ...(body.is_default !== undefined ? { isDefault: body.is_default } : {}),
    };
    const updated = await this.store.updateSavedAddress(id, request.user.sub, patch);
    if (!updated) throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', detail: 'Không tìm thấy địa chỉ thuộc tài khoản hiện tại.', retryable: false });
    return { data: toPublicAddress(updated), meta: { request_id: request.correlationId } };
  }

  @Post(':id/default')
  async setDefault(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const updated = await this.store.updateSavedAddress(id, request.user.sub, { isDefault: true });
    if (!updated) throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', detail: 'Không tìm thấy địa chỉ thuộc tài khoản hiện tại.', retryable: false });
    return { data: toPublicAddress(updated), meta: { request_id: request.correlationId } };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const deleted = await this.store.deleteSavedAddress(id, request.user.sub);
    if (!deleted) throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', detail: 'Không tìm thấy địa chỉ thuộc tài khoản hiện tại.', retryable: false });
    return { data: { deleted: true }, meta: { request_id: request.correlationId } };
  }

  @Post('resolve')
  async resolve(@Body() body: { address_text?: string }): Promise<object> {
    return { data: await this.locations.geocode(typeof body.address_text === 'string' ? body.address_text : '') };
  }
}

@Controller('api/v1/location')
@UseGuards(AuthGuard)
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @Post('geocode')
  async geocode(@Body() body: { address_text?: string }): Promise<object> {
    return { data: await this.locations.geocode(typeof body.address_text === 'string' ? body.address_text : '') };
  }

  @Post('reverse-geocode')
  async reverseGeocode(@Body() body: { latitude?: number; longitude?: number }): Promise<object> {
    const latitude = numberValue(body.latitude);
    const longitude = numberValue(body.longitude);
    if (latitude === undefined || longitude === undefined) throw new BadRequestException({ code: 'COORDINATES_REQUIRED', detail: 'Cần có vĩ độ và kinh độ.', retryable: false });
    return { data: await this.locations.reverseGeocode({ latitude, longitude }) };
  }

  @Post('route')
  async route(@Body() body: { origin?: LocationCoordinate; destination?: LocationCoordinate }): Promise<object> {
    if (!body.origin || !body.destination) throw new BadRequestException({ code: 'COORDINATES_REQUIRED', detail: 'Cần có điểm đi và điểm đến.', retryable: false });
    return { data: await this.locations.route(body.origin, body.destination) };
  }

  @Post('autocomplete')
  async autocomplete(@Body() body: { address_text?: string }): Promise<object> {
    return { data: await this.locations.autocomplete(typeof body.address_text === 'string' ? body.address_text : '') };
  }
}

@Controller('api/v1/healthcare/patients')
@UseGuards(AuthGuard)
export class HealthcarePatientController {
  constructor(private readonly healthcare: HealthcareClient) {}

  @Get()
  async list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.healthcare.listPatients(request.user.sub, request.correlationId ?? 'cor_unknown'), meta: { request_id: request.correlationId } };
  }

  @Post()
  async create(@Body() body: PatientCreateDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = idempotencyKey?.trim();
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key is required for a patient write.', retryable: false });
    const data = await this.healthcare.createPatient(request.user.sub, request.correlationId ?? 'cor_unknown', key, {
      name: body.name.trim(),
      phone: body.phone.trim(),
      relationship: body.relationship ?? 'self',
      ...(body.blood_type !== undefined ? { blood_type: body.blood_type.trim() } : {}),
      ...(body.medical_history !== undefined ? { medical_history: body.medical_history.trim() } : {}),
    });
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post(':id/default')
  async setDefault(@Param('id') id: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const patientId = Number(id);
    const key = idempotencyKey?.trim();
    if (!Number.isInteger(patientId) || patientId < 1) throw new BadRequestException({ code: 'PATIENT_ID_INVALID', detail: 'Patient id is invalid.', retryable: false });
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key is required for a patient write.', retryable: false });
    const data = await this.healthcare.setDefaultPatient(request.user.sub, request.correlationId ?? 'cor_unknown', key, patientId);
    return { data, meta: { request_id: request.correlationId } };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: PatientPatchDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const patientId = Number(id);
    const key = idempotencyKey?.trim();
    if (!Number.isInteger(patientId) || patientId < 1) throw new BadRequestException({ code: 'PATIENT_ID_INVALID', detail: 'Patient id is invalid.', retryable: false });
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key is required for this write.', retryable: false });
    const data = await this.healthcare.updatePatient(request.user.sub, request.correlationId ?? 'cor_unknown', key, patientId, {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
      ...(body.relationship !== undefined ? { relationship: body.relationship } : {}),
    });
    return { data, meta: { request_id: request.correlationId } };
  }

  @Delete(':id')
  async unlink(@Param('id') id: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const patientId = Number(id);
    const key = idempotencyKey?.trim();
    if (!Number.isInteger(patientId) || patientId < 1) throw new BadRequestException({ code: 'PATIENT_ID_INVALID', detail: 'Patient id is invalid.', retryable: false });
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key is required for this write.', retryable: false });
    const data = await this.healthcare.unlinkPatient(request.user.sub, request.correlationId ?? 'cor_unknown', key, patientId);
    return { data, meta: { request_id: request.correlationId } };
  }
}

function assertCoordinatePair(latitude: number | undefined, longitude: number | undefined): void {
  if ((latitude === undefined) !== (longitude === undefined)) throw new BadRequestException({ code: 'COORDINATE_PAIR_REQUIRED', detail: 'Vĩ độ và kinh độ phải được gửi cùng nhau.', retryable: false });
}

function foldLocalAddress(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function roundCoordinate(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 1_000_000) / 1_000_000;
}

function clean(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function normalizePhone(value: string): string {
  return value.trim().replace(/[\s().-]/g, '');
}

function assertCoordinate(value: LocationCoordinate, name: string): void {
  if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) {
    throw new BadRequestException({ code: 'INVALID_COORDINATES', detail: `Tọa độ ${name} không hợp lệ.`, retryable: false });
  }
}

function toPublicAddress(value: SavedAddressRecord): object {
  return { id: value.id, label: value.label, address_text: value.addressText, ...(value.city ? { city: value.city } : {}), ...(value.district ? { district: value.district } : {}), ...(value.ward ? { ward: value.ward } : {}), ...(value.latitude !== undefined ? { latitude: value.latitude } : {}), ...(value.longitude !== undefined ? { longitude: value.longitude } : {}), ...(value.provider ? { provider: value.provider } : {}), source: value.source, is_default: value.isDefault, created_at: value.createdAt, updated_at: value.updatedAt };
}

function haversineKm(left: LocationCoordinate, right: LocationCoordinate): number {
  const radius = 6371;
  const latitude = (right.latitude - left.latitude) * Math.PI / 180;
  const longitude = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(left.latitude * Math.PI / 180) * Math.cos(right.latitude * Math.PI / 180) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const serialized = JSON.stringify(value, Object.keys(value as object).sort());
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) hash = ((hash << 5) - hash + serialized.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(16).padStart(8, '0');
}

@Module({ imports: [AuthModule, CoreModule], controllers: [PersonalProfileController, SavedAddressController, LocationController, HealthcarePatientController], providers: [GeoapifyProvider, LocationService], exports: [LocationService] })
export class PersonalModule {}
