import { BadRequestException, Controller, Get, Injectable, Module, Param, Query, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { PaymentModule } from '../payment/payment.module';
import { PaymentService } from '../payment/payment.service';

export type HistoryType = 'food_order' | 'ride_booking' | 'restaurant_reservation' | 'healthcare_appointment';

export interface HistoryItem {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  detail: string;
  timestamp: string;
  source: HistoryType;
  resource: JsonObject;
}

const TERMINAL_HISTORY_STATUSES: Record<HistoryType, ReadonlySet<string>> = {
  ride_booking: new Set(['COMPLETED', 'NO_DRIVER', 'FAILED', 'PAYMENT_FAILED', 'CANCELLED']),
  food_order: new Set(['DELIVERED', 'PAYMENT_FAILED', 'RESTAURANT_REJECTED', 'CANCELLED', 'REFUNDED']),
  restaurant_reservation: new Set(['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW']),
  healthcare_appointment: new Set(['COMPLETED', 'CANCELLED', 'EXPIRED']),
};

export class HistoryQueryDto {
  @IsOptional()
  @IsIn(['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'])
  service?: HistoryType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

@Injectable()
export class HistoryService {
  constructor(private readonly food: FoodClient, private readonly ride: RideClient, private readonly restaurant: RestaurantClient, private readonly healthcare: HealthcareClient, private readonly payments: PaymentService) {}

  async list(actorId: string, correlationId: string, options: HistoryQueryDto = new HistoryQueryDto()): Promise<{ items: HistoryItem[]; total: number; page: number; page_size: number; has_more: boolean; partial: boolean; unavailable: string[] }> {
    const names = ['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'] as const;
    const requested = options.service ? [options.service] : names;
    const responses = await Promise.allSettled(requested.map((name) => {
      if (name === 'food_order') return this.food.listOrders(correlationId, actorId);
      if (name === 'ride_booking') return this.ride.listBookings(actorId, { correlationId });
      if (name === 'restaurant_reservation') return this.restaurant.listReservations(actorId, correlationId);
      return this.healthcare.listAppointments(actorId, correlationId);
    }));
    const unavailable: string[] = [];
    const items: HistoryItem[] = [];
    responses.forEach((result, index) => {
      const name = requested[index];
      if (result.status === 'rejected') {
        unavailable.push(name);
        return;
      }
      for (const value of extractItems(result.value)) items.push(normalizeHistoryItem(name, value));
    });
    items.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    if (!items.length && unavailable.length === requested.length) throw new ServiceUnavailableException({ code: 'HISTORY_UNAVAILABLE', detail: 'Lịch sử đang tạm thời chưa sẵn sàng.', retryable: true });
    const filtered = items.filter((item) => matchesHistory(item, options));
    const page = options.page ?? 1;
    const pageSize = options.page_size ?? 20;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);
    return { items: pageItems, total: filtered.length, page, page_size: pageSize, has_more: start + pageItems.length < filtered.length, partial: unavailable.length > 0, unavailable };
  }

  async active(actorId: string, correlationId: string): Promise<{ items: HistoryItem[]; partial: boolean; unavailable: string[] }> {
    const names = ['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'] as const;
    const responses = await Promise.allSettled(names.map((name) => {
      if (name === 'food_order') return this.food.listOrders(correlationId, actorId);
      if (name === 'ride_booking') return this.ride.listBookings(actorId, { correlationId });
      if (name === 'restaurant_reservation') return this.restaurant.listReservations(actorId, correlationId);
      return this.healthcare.listAppointments(actorId, correlationId);
    }));
    const unavailable: string[] = [];
    const items: HistoryItem[] = [];
    responses.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'rejected') {
        unavailable.push(name);
        return;
      }
      for (const value of extractItems(result.value)) {
        const normalized = normalizeHistoryItem(name, value);
        if (!TERMINAL_HISTORY_STATUSES[name].has(normalized.status.toUpperCase())) items.push(normalized);
      }
    });
    items.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    return { items, partial: unavailable.length > 0, unavailable };
  }

  async get(type: HistoryType, id: string, actorId: string, correlationId: string): Promise<JsonObject> {
    if (!id.trim()) throw new BadRequestException({ code: 'HISTORY_ID_REQUIRED', detail: 'Mã lịch sử là bắt buộc.', retryable: false });
    if (type === 'food_order') {
      const order = await this.food.get(`/api/v1/orders/${encodeURIComponent(id)}`, correlationId, actorId);
      const payment = await this.payments.consumerSummaryForOrder(id, actorId);
      return payment ? { ...order, payment } : order;
    }
    if (type === 'ride_booking') return this.ride.getBooking(actorId, { correlationId }, id).then((value) => value as unknown as JsonObject);
    if (type === 'restaurant_reservation') return this.restaurant.getReservation(id, actorId, correlationId);
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) throw new BadRequestException({ code: 'HISTORY_ID_INVALID', detail: 'Mã lịch khám không hợp lệ.', retryable: false });
    return this.healthcare.getAppointment(appointmentId, actorId, correlationId);
  }
}

@Controller('api/v1/history')
@UseGuards(AuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  list(@Query() query: HistoryQueryDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.history.list(request.user.sub, request.correlationId ?? 'cor_unknown', query).then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Get('active')
  active(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.history.active(request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Get(':type/:id')
  get(@Param('type') type: string, @Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!isHistoryType(type)) throw new BadRequestException({ code: 'HISTORY_TYPE_INVALID', detail: 'Loại lịch sử không được hỗ trợ.', retryable: false });
    return this.history.get(type, id, request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }
}

function isHistoryType(value: string): value is HistoryType {
  return ['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'].includes(value);
}

function extractItems(value: JsonObject): JsonObject[] {
  const data = value.items;
  return Array.isArray(data) ? data.filter(isObject) : isObject(data) && Array.isArray(data.items) ? data.items.filter(isObject) : [];
}

function normalizeHistoryItem(type: HistoryType, resource: JsonObject): HistoryItem {
  const id = String(resource.id ?? resource.booking_id ?? resource.appointment_id ?? resource.reservation_id ?? 'unknown');
  const slot = isObject(resource.slot) ? resource.slot : undefined;
  const timestamp = String(resource.updated_at ?? resource.created_at ?? resource.booking_time ?? resource.start_at ?? resource.start_time ?? slot?.start_time ?? new Date(0).toISOString());
  const status = String(resource.status ?? 'UNKNOWN');
  const restaurant = isObject(resource.restaurant) ? resource.restaurant : undefined;
  const doctor = isObject(resource.doctor) ? resource.doctor : undefined;
  const department = isObject(resource.department) ? resource.department : undefined;
  const pickup = String(resource.pickup_address ?? resource.pickup ?? '');
  const dropoff = String(resource.dropoff_address ?? resource.dropoff ?? '');
  const vehicle = String(resource.vehicle_type ?? '');
  const fare = moneyText(resource.amount ?? resource.fare);
  const foodItems = Array.isArray(resource.items) ? resource.items.filter(isObject) : [];
  const foodNames = foodItems.map((item) => String(item.name ?? item.title ?? '')).filter(Boolean);
  const restaurantName = String(restaurant?.name ?? resource.restaurant_name ?? '');
  const foodSummary = foodNames.length ? foodNames.slice(0, 3).join(', ') : `${foodItems.length || 0} món`;
  const facility = isObject(resource.facility)
    ? resource.facility
    : doctor && isObject(doctor.facility) ? doctor.facility : undefined;
  const facilityName = String(facility?.name ?? resource.facility_name ?? '');
  const doctorName = String(resource.doctor_name ?? doctor?.name ?? '');
  const departmentName = String(resource.department_name ?? department?.name ?? (typeof resource.department === 'string' ? resource.department : ''));
  const appointmentTime = String(resource.start_time ?? resource.start_at ?? slot?.start_time ?? '');
  const title = type === 'food_order'
    ? restaurantName ? `Đơn tại ${restaurantName}` : 'Đơn giao đồ ăn'
    : type === 'ride_booking'
      ? pickup && dropoff ? `Chuyến xe ${pickup} → ${dropoff}` : 'Chuyến xe'
      : type === 'restaurant_reservation'
        ? `Đặt bàn${restaurantName ? ` tại ${restaurantName}` : ''}`
        : facilityName ? `Lịch khám tại ${facilityName}` : 'Lịch khám';
  const detail = type === 'food_order'
    ? `${foodSummary}${restaurantName ? ` tại ${restaurantName}` : ''}${moneyText(resource.amount ?? resource.total) ? ` • ${moneyText(resource.amount ?? resource.total)}` : ''}`
    : type === 'ride_booking'
      ? `${pickup && dropoff ? `${pickup} → ${dropoff}` : 'Lộ trình đang được cập nhật'}${vehicle ? ` • ${vehicle}` : ''}${fare ? ` • ${fare}` : ''}`
      : type === 'restaurant_reservation'
        ? `${restaurantName || 'Nhà hàng đang được cập nhật'}${resource.booking_time ? ` • ${String(resource.booking_time)}` : ''}${resource.party_size !== undefined ? ` • ${String(resource.party_size)} người` : ''}`
        : `${facilityName || 'Cơ sở đang được cập nhật'}${doctorName ? ` • ${doctorName}` : ''}${departmentName ? ` • ${departmentName}` : ''}${appointmentTime ? ` • ${appointmentTime}` : ''}`;
  return { id, type, title, status, detail, timestamp, source: type, resource };
}

function moneyText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} VND`;
  if (isObject(value) && typeof value.amount === 'number' && Number.isFinite(value.amount)) return `${value.amount} ${typeof value.currency === 'string' ? value.currency : 'VND'}`;
  return '';
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesHistory(item: HistoryItem, options: HistoryQueryDto): boolean {
  if (options.service && item.type !== options.service) return false;
  if (options.status && item.status.toLowerCase() !== options.status.trim().toLowerCase()) return false;
  const timestamp = Date.parse(item.timestamp);
  if (options.from) {
    const from = Date.parse(options.from);
    if (!Number.isFinite(timestamp) || !Number.isFinite(from) || timestamp < from) return false;
  }
  if (options.to) {
    const to = dateFilterEnd(options.to);
    if (!Number.isFinite(timestamp) || !Number.isFinite(to) || timestamp > to) return false;
  }
  return true;
}

function dateFilterEnd(value: string): number {
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed)) return parsed;
  return parsed + 24 * 60 * 60 * 1000 - 1;
}

@Module({ imports: [AuthModule, PaymentModule], controllers: [HistoryController], providers: [HistoryService] })
export class HistoryModule {}
