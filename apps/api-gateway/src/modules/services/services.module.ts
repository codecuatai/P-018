import { BadRequestException, Body, Controller, Get, Headers, Injectable, Module, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested, ArrayMaxSize } from 'class-validator';
import { createHash } from 'crypto';
import { Type } from 'class-transformer';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { PersonalModule } from '../personal/personal.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { rankByDistance } from './location-ranking';
import { ServiceActionsController } from './service-actions.controller';
import { RideActionsController } from './ride-actions.controller';
import { LocationService } from '../personal/personal.module';

export type ServiceKey = 'food' | 'ride' | 'restaurant' | 'healthcare';

class RideStopoverDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  address!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class RideQuoteDto {
  @IsString()
  @MinLength(3)
  pickup_address!: string;

  @IsString()
  @MinLength(3)
  dropoff_address!: string;

  @IsOptional()
  @IsIn(['BIKE', 'CAR_4', 'CAR_7'])
  vehicle_type?: 'BIKE' | 'CAR_4' | 'CAR_7';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  passenger_count?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickup_latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickup_longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoff_latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoff_longitude?: number;

  @IsOptional()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => RideStopoverDto)
  stopovers?: RideStopoverDto[];
}

const catalog = [
  { key: 'food', label: 'Đồ ăn', description: 'Tìm món, xem thực đơn và theo dõi đơn giao.', accent: 'food' },
  { key: 'ride', label: 'Chuyến xe', description: 'Tính lộ trình, xem giá và theo dõi tài xế.', accent: 'ride' },
  { key: 'restaurant', label: 'Nhà hàng', description: 'Tìm bàn trống và giữ chỗ theo thời gian.', accent: 'restaurant' },
  { key: 'healthcare', label: 'Lịch khám', description: 'Xem cơ sở, chuyên khoa và khung giờ phù hợp.', accent: 'healthcare' },
] as const;

// Số bản ghi trả về khi client không gửi `limit`. Trước đây food/restaurant bị
// hard-code là 4, khiến trang duyệt chỉ thấy 4/239 nhà hàng và không có trang 2.
const DEFAULT_BROWSE_LIMIT = 12;
// ride/healthcare giữ nguyên mặc định 6 như trước để không đổi hành vi ngoài phạm vi sửa.
const DEFAULT_DEPARTMENT_BROWSE_LIMIT = 6;
// Trần cứng: food-service khai báo `limit: int = Field(default=12, ge=1, le=100)`
// và restaurant-service `Query(50, ge=1, le=100)`, nên vượt 100 sẽ bị 422.
// Clamp tại gateway để lỗi không dội xuống người dùng.
const MAX_BROWSE_LIMIT = 100;

@Injectable()
export class ServiceHubService {
  constructor(private readonly food: FoodClient, private readonly ride: RideClient, private readonly restaurant: RestaurantClient, private readonly healthcare: HealthcareClient, private readonly locations: LocationService) {}

  list(): object { return { items: catalog }; }

  async catalog(actorId: string, correlationId: string): Promise<{ items: Array<{ id: ServiceKey; label: string; description: string; status: 'AVAILABLE' | 'DEGRADED'; browse_mode: 'results' | 'quote' | 'departments'; capabilities: string[]; items: JsonObject[]; source: string }>; checked_at: string }> {
    const responses = await Promise.allSettled(catalog.map((item) => this.browse(item.key, actorId, correlationId)));
    const items = catalog.map((item, index) => {
      const result = responses[index];
      const data = result.status === 'fulfilled' ? result.value : undefined;
      return {
        id: item.key,
        label: item.label,
        description: item.description,
        status: data ? 'AVAILABLE' as const : 'DEGRADED' as const,
        browse_mode: item.key === 'ride' ? 'quote' as const : item.key === 'healthcare' ? 'departments' as const : 'results' as const,
        capabilities: capabilitiesFor(item.key),
        items: data?.items ?? [],
        source: data?.source ?? `${item.key}-service`,
      };
    });
    return { items, checked_at: new Date().toISOString() };
  }

  async browse(service: ServiceKey, actorId: string, correlationId: string, keyword?: string, origin?: { latitude: number; longitude: number }, pagination?: { page?: number; limit?: number; offset?: number }): Promise<{ items: JsonObject[]; total: number; page: number; limit: number; total_pages: number; source: string; partial: boolean }> {
    const page = pagination?.page && pagination.page > 0 ? pagination.page : 1;
    const defaultLimit = service === 'food' || service === 'restaurant' ? DEFAULT_BROWSE_LIMIT : DEFAULT_DEPARTMENT_BROWSE_LIMIT;
    const limit = pagination?.limit && pagination.limit > 0 ? Math.min(Math.trunc(pagination.limit), MAX_BROWSE_LIMIT) : defaultLimit;
    const offset = pagination?.offset !== undefined && pagination.offset >= 0 ? pagination.offset : (page - 1) * limit;

    if (service === 'food') {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const value = await this.food.get(`/api/v1/restaurants?${params.toString()}`, correlationId, actorId);
      const rawItems = arrayValue(value);
      const total = typeof value.total === 'number'
        ? value.total
        : isObject(value.data) && typeof (value.data as JsonObject).total === 'number'
          ? (value.data as JsonObject).total as number
          : rawItems.length;
      return {
        items: rankByDistance(rawItems, origin),
        total,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        source: 'food-service',
        partial: false,
      };
    }
    if (service === 'restaurant') {
      const value = await this.restaurant.listRestaurants(actorId, correlationId, keyword, limit, offset);
      const rawItems = isObject(value.items) && Array.isArray(value.items.items)
        ? value.items.items.filter(isObject)
        : Array.isArray(value.items)
          ? value.items.filter(isObject)
          : arrayValue(value);
      const total = isObject(value.items) && typeof value.items.total === 'number'
        ? value.items.total
        : typeof value.total === 'number'
          ? value.total
          : isObject(value.data) && typeof (value.data as JsonObject).total === 'number'
            ? (value.data as JsonObject).total as number
            : rawItems.length;
      return {
        items: rankByDistance(rawItems, origin),
        total,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        source: 'restaurant-service',
        partial: false,
      };
    }
    if (service === 'healthcare') {
      const value = await this.healthcare.listDepartments(actorId, correlationId, keyword, limit, offset);
      const rawItems = arrayValue(value);
      const total = typeof value.total === 'number'
        ? value.total
        : isObject(value.data) && typeof (value.data as JsonObject).total === 'number'
          ? (value.data as JsonObject).total as number
          : rawItems.length;
      return {
        items: rankByDistance(rawItems, origin),
        total,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        source: 'healthcare-service',
        partial: false,
      };
    }
    const value = await this.ride.listQuotes(actorId, { correlationId });
    const rawItems = arrayValue(value);
    return {
      items: rankByDistance(rawItems, origin),
      total: rawItems.length,
      page: 1,
      limit: rawItems.length || 1,
      total_pages: 1,
      source: 'ride-service',
      partial: false,
    };
  }

  async quoteRide(actorId: string, idempotencyKey: string, correlationId: string, body: RideQuoteDto): Promise<unknown> {
    const pickup = await this.resolveAddress(body.pickup_address, body.pickup_latitude, body.pickup_longitude);
    const dropoff = await this.resolveAddress(body.dropoff_address, body.dropoff_latitude, body.dropoff_longitude);
    const stopovers = (body.stopovers ?? []).map((stopover) => ({ address: stopover.address.trim(), coordinate: { latitude: stopover.latitude, longitude: stopover.longitude } }));
    const points = [pickup, ...stopovers, dropoff];
    const segments = await Promise.all(points.slice(0, -1).map((origin, index) => this.locations.route(origin.coordinate, points[index + 1].coordinate)));
    if (segments.some((route) => (
      route.status !== 'RESOLVED'
      || route.provider !== 'geoapify'
      || !route.route_distance_meters
      || route.route_distance_meters <= 0
      || !route.route_duration_seconds
      || route.route_duration_seconds <= 0
      || !route.route_geometry
      || route.route_geometry.length < 2
    ))) throw new BadRequestException({ code: 'REAL_ROUTE_REQUIRED', detail: 'Hiện mình chưa lấy được vị trí/đường đi. Bạn thử lại giúp mình nhé.', retryable: true });
    const primaryRoute = segments[0];
    if (!primaryRoute) throw new BadRequestException({ code: 'REAL_ROUTE_REQUIRED', detail: 'Hành trình chưa có đủ chặng đường để báo giá.', retryable: true });
    const routeGeometry = segments.flatMap((route, index) => index ? route.route_geometry!.slice(1) : route.route_geometry!);
    const routeDistanceMeters = segments.reduce((total, route) => total + (route.route_distance_meters ?? 0), 0);
    const routeDurationSeconds = segments.reduce((total, route) => total + (route.route_duration_seconds ?? 0), 0);
    const routeProvider = segments.every((route) => route.provider === primaryRoute.provider) ? primaryRoute.provider : 'composed-route';
    const routeSnapshotHash = stopovers.length
      ? createHash('sha256').update(JSON.stringify({ pickup: pickup.coordinate, stopovers: stopovers.map((stopover) => stopover.coordinate), dropoff: dropoff.coordinate, routeDistanceMeters, routeDurationSeconds, routeProvider })).digest('hex')
      : primaryRoute.route_snapshot_hash;
    return this.ride.createQuote(actorId, idempotencyKey, { correlationId, workflowId: `web-ride-${idempotencyKey}` }, {
      pickup_address: pickup.address,
      dropoff_address: dropoff.address,
      vehicle_type: body.vehicle_type ?? 'CAR_4',
      passenger_count: body.passenger_count ?? 1,
      pickup_latitude: pickup.coordinate.latitude,
      pickup_longitude: pickup.coordinate.longitude,
      dropoff_latitude: dropoff.coordinate.latitude,
      dropoff_longitude: dropoff.coordinate.longitude,
      route_provider: routeProvider,
      route_distance_meters: routeDistanceMeters,
      route_duration_seconds: routeDurationSeconds,
      route_geometry: routeGeometry,
      ...(routeSnapshotHash ? { route_snapshot_hash: routeSnapshotHash } : {}),
      ...(stopovers.length ? { stopovers: stopovers.map((stopover) => ({ address: stopover.address, ...stopover.coordinate })) } : {}),
    });
  }

  private async resolveAddress(address: string, latitude?: number, longitude?: number): Promise<{ address: string; coordinate: { latitude: number; longitude: number } }> {
    if (latitude !== undefined && longitude !== undefined) return { address: address.trim(), coordinate: { latitude, longitude } };
    const result = await this.locations.geocode(address);
    const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
    if (!candidate || candidate.latitude === null || candidate.longitude === null) throw new BadRequestException({ code: 'LOCATION_UNRESOLVED', detail: 'Hiện mình chưa xác định được địa chỉ này. Bạn thử chọn gợi ý hoặc nhập rõ hơn nhé.', retryable: true });
    return { address: candidate.address_text, coordinate: { latitude: candidate.latitude, longitude: candidate.longitude } };
  }
}

@Controller('api/v1/services')
@UseGuards(AuthGuard)
export class ServiceHubController {
  constructor(private readonly hub: ServiceHubService) {}

  @Get()
  list(@Req() request: CorrelatedRequest & { user: AuthUser }): object { return { data: this.hub.list(), meta: { request_id: request.correlationId } }; }

  @Get('catalog')
  async catalog(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const data = await this.hub.catalog(request.user.sub, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Get(':service')
  async browse(
    @Param('service') service: string,
    @Query('q') keyword: string | undefined,
    @Query('latitude') latitudeValue: string | undefined,
    @Query('longitude') longitudeValue: string | undefined,
    @Query('page') pageValue: string | undefined,
    @Query('limit') limitValue: string | undefined,
    @Query('offset') offsetValue: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser }
  ): Promise<object> {
    if (!isServiceKey(service)) throw new BadRequestException({ code: 'SERVICE_INVALID', detail: 'Dịch vụ không được hỗ trợ.', retryable: false });
    const latitude = parseCoordinate(latitudeValue, -90, 90);
    const longitude = parseCoordinate(longitudeValue, -180, 180);
    if ((latitudeValue !== undefined && latitude === undefined) || (longitudeValue !== undefined && longitude === undefined)) throw new BadRequestException({ code: 'LOCATION_INVALID', detail: 'Invalid coordinates.', retryable: false });
    const page = pageValue ? Number(pageValue) : undefined;
    const limit = limitValue ? Number(limitValue) : undefined;
    const offset = offsetValue ? Number(offsetValue) : undefined;
    const data = await this.hub.browse(
      service,
      request.user.sub,
      request.correlationId ?? 'cor_unknown',
      keyword,
      latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
      { page, limit, offset }
    );
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post('ride/quote')
  async quote(@Body() body: RideQuoteDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho báo giá.', retryable: false });
    const data = await this.hub.quoteRide(request.user.sub, idempotencyKey.trim(), request.correlationId ?? 'cor_unknown', body);
    return { data, meta: { request_id: request.correlationId } };
  }
}

@Controller('api/v1/rides')
@UseGuards(AuthGuard)
export class RideTrackingController {
  private readonly driverRoutes = new Map<string, DriverRouteSnapshot>();

  constructor(private readonly ride: RideClient, private readonly locations: LocationService) {}

  @Get(':bookingId/tracking')
  async tracking(@Param('bookingId') bookingId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!bookingId.trim()) throw new BadRequestException({ code: 'BOOKING_ID_REQUIRED', detail: 'Mã chuyến xe là bắt buộc.', retryable: false });
    const data = await this.ride.getTracking(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown' }, bookingId);
    const enriched = await this.withDriverRoute(bookingId, data);
    return { data: enriched, meta: { request_id: request.correlationId } };
  }

  private async withDriverRoute(bookingId: string, data: JsonObject): Promise<JsonObject> {
    const status = typeof data.status === 'string' ? data.status : '';
    if (!['DRIVER_ASSIGNED', 'DRIVER_TO_PICKUP'].includes(status)) {
      if (['COMPLETED', 'NO_DRIVER', 'FAILED', 'PAYMENT_FAILED', 'CANCELLED'].includes(status)) this.driverRoutes.delete(bookingId);
      return data;
    }
    const route = isObject(data.route) ? data.route : {};
    const pickup = coordinateValue(route.origin);
    const driverLocation = coordinateValue(data.driver_location);
    if (!pickup || !driverLocation) return data;
    let snapshot = this.driverRoutes.get(bookingId);
    if (!snapshot) {
      const resolved = await this.locations.route(driverLocation, pickup);
      const geometry = resolved.route_geometry;
      if (resolved.provider !== 'geoapify' || resolved.status !== 'RESOLVED' || !geometry || geometry.length < 2 || resolved.route_distance_meters === undefined || resolved.route_duration_seconds === undefined || !resolved.route_snapshot_hash) {
        throw new BadRequestException({ code: 'REAL_ROUTE_REQUIRED', detail: 'Hiện mình chưa lấy được vị trí/đường đi. Bạn thử lại giúp mình nhé.', retryable: true });
      }
      snapshot = {
        provider: resolved.provider,
        origin: resolved.origin,
        destination: resolved.destination,
        distance_meters: resolved.route_distance_meters,
        duration_seconds: resolved.route_duration_seconds,
        geometry,
        snapshot_hash: resolved.route_snapshot_hash,
      };
      this.driverRoutes.set(bookingId, snapshot);
    }
    if (!snapshot) return data;
    return {
      ...data,
      driver_route: snapshot,
    };
  }
}

type DriverRouteSnapshot = {
  provider: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  distance_meters: number;
  duration_seconds: number;
  geometry: Array<{ latitude: number; longitude: number }>;
  snapshot_hash: string;
};

function coordinateValue(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!isObject(value) || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return undefined;
  if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return undefined;
  return { latitude: value.latitude, longitude: value.longitude };
}

function isServiceKey(value: string): value is ServiceKey { return catalog.some((item) => item.key === value); }
function capabilitiesFor(service: ServiceKey): string[] {
  return service === 'food' ? ['Tìm nhà hàng', 'Thực đơn', 'Theo dõi đơn'] : service === 'ride' ? ['Báo giá', 'Chọn xe', 'Theo dõi chuyến'] : service === 'restaurant' ? ['Tìm nhà hàng', 'Kiểm tra bàn', 'Giữ chỗ'] : ['Chuyên khoa', 'Khung giờ', 'Hồ sơ bệnh nhân'];
}
function arrayValue(value: JsonObject): JsonObject[] { const candidate = value.items ?? value; return Array.isArray(candidate) ? candidate.filter(isObject) : []; }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function parseCoordinate(value: string | undefined, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : undefined;
}

import { ProviderServicesController } from './provider-services.controller';
import { ProviderOfferingsStore } from './provider-offerings.store';

@Module({
  imports: [AuthModule, PersonalModule],
  controllers: [
    ServiceHubController,
    RideTrackingController,
    ServiceActionsController,
    RideActionsController,
    ProviderServicesController,
  ],
  providers: [
    ServiceHubService,
    FoodClient,
    RideClient,
    RestaurantClient,
    HealthcareClient,
    ProviderOfferingsStore,
  ],
  exports: [ServiceHubService, ProviderOfferingsStore],
})
export class ServicesModule {}
