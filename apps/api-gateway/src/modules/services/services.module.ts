import { BadRequestException, Body, Controller, Get, Headers, Injectable, Module, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { rankByDistance } from './location-ranking';
import { ServiceActionsController } from './service-actions.controller';
import { RideActionsController } from './ride-actions.controller';

export type ServiceKey = 'food' | 'ride' | 'restaurant' | 'healthcare';

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
}

const catalog = [
  { key: 'food', label: 'Đồ ăn', description: 'Tìm món, xem thực đơn và theo dõi đơn giao.', accent: 'food' },
  { key: 'ride', label: 'Chuyến xe', description: 'Tính lộ trình, xem giá và theo dõi tài xế.', accent: 'ride' },
  { key: 'restaurant', label: 'Nhà hàng', description: 'Tìm bàn trống và giữ chỗ theo thời gian.', accent: 'restaurant' },
  { key: 'healthcare', label: 'Lịch khám', description: 'Xem cơ sở, chuyên khoa và khung giờ thật.', accent: 'healthcare' },
] as const;

@Injectable()
export class ServiceHubService {
  constructor(private readonly food: FoodClient, private readonly ride: RideClient, private readonly restaurant: RestaurantClient, private readonly healthcare: HealthcareClient) {}

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

  async browse(service: ServiceKey, actorId: string, correlationId: string, keyword?: string, origin?: { latitude: number; longitude: number }): Promise<{ items: JsonObject[]; source: string; partial: boolean }> {
    if (service === 'food') {
      const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
      const value = await this.food.get(`/api/v1/restaurants${query}`, correlationId, actorId);
      return { items: rankByDistance(arrayValue(value), origin), source: 'food-service', partial: false };
    }
    if (service === 'restaurant') {
      const value = await this.restaurant.listRestaurants(actorId, correlationId, keyword);
      const items = isObject(value.items) && Array.isArray(value.items.items) ? value.items.items.filter(isObject) : Array.isArray(value.items) ? value.items.filter(isObject) : [];
      return { items: rankByDistance(items, origin), source: 'restaurant-service', partial: false };
    }
    if (service === 'healthcare') {
      const value = await this.healthcare.listDepartments(actorId, correlationId);
      return { items: rankByDistance(arrayValue(value), origin), source: 'healthcare-service', partial: false };
    }
    const value = await this.ride.listQuotes(actorId, { correlationId });
    return { items: rankByDistance(arrayValue(value), origin), source: 'ride-service', partial: false };
  }

  quoteRide(actorId: string, idempotencyKey: string, correlationId: string, body: RideQuoteDto): Promise<unknown> {
    return this.ride.createQuote(actorId, idempotencyKey, { correlationId, workflowId: `web-ride-${idempotencyKey}` }, {
      pickup_address: body.pickup_address.trim(),
      dropoff_address: body.dropoff_address.trim(),
      vehicle_type: body.vehicle_type ?? 'CAR_4',
      ...(body.pickup_latitude !== undefined ? { pickup_latitude: body.pickup_latitude } : {}),
      ...(body.pickup_longitude !== undefined ? { pickup_longitude: body.pickup_longitude } : {}),
      ...(body.dropoff_latitude !== undefined ? { dropoff_latitude: body.dropoff_latitude } : {}),
      ...(body.dropoff_longitude !== undefined ? { dropoff_longitude: body.dropoff_longitude } : {}),
    });
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
  async browse(@Param('service') service: string, @Query('q') keyword: string | undefined, @Query('latitude') latitudeValue: string | undefined, @Query('longitude') longitudeValue: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!isServiceKey(service)) throw new BadRequestException({ code: 'SERVICE_INVALID', detail: 'Dịch vụ không được hỗ trợ.', retryable: false });
    const latitude = parseCoordinate(latitudeValue, -90, 90);
    const longitude = parseCoordinate(longitudeValue, -180, 180);
    if ((latitudeValue !== undefined && latitude === undefined) || (longitudeValue !== undefined && longitude === undefined)) throw new BadRequestException({ code: 'LOCATION_INVALID', detail: 'Invalid coordinates.', retryable: false });
    const data = await this.hub.browse(service, request.user.sub, request.correlationId ?? 'cor_unknown', keyword, latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined);
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
  constructor(private readonly ride: RideClient) {}

  @Get(':bookingId/tracking')
  async tracking(@Param('bookingId') bookingId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!bookingId.trim()) throw new BadRequestException({ code: 'BOOKING_ID_REQUIRED', detail: 'Mã chuyến xe là bắt buộc.', retryable: false });
    const data = await this.ride.getTracking(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown' }, bookingId);
    return { data, meta: { request_id: request.correlationId } };
  }
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

@Module({ imports: [AuthModule], controllers: [ServiceHubController, RideTrackingController, ServiceActionsController, RideActionsController], providers: [ServiceHubService, FoodClient, RideClient, RestaurantClient, HealthcareClient], exports: [ServiceHubService] })
export class ServicesModule {}
