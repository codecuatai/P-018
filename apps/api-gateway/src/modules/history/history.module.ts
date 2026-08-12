import { BadRequestException, Controller, Get, Injectable, Module, Param, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';

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

@Injectable()
export class HistoryService {
  constructor(private readonly food: FoodClient, private readonly ride: RideClient, private readonly restaurant: RestaurantClient, private readonly healthcare: HealthcareClient, private readonly payments: PaymentService) {}

  async list(actorId: string, correlationId: string): Promise<{ items: HistoryItem[]; partial: boolean; unavailable: string[] }> {
    const responses = await Promise.allSettled([
      this.food.listOrders(correlationId, actorId),
      this.ride.listBookings(actorId, { correlationId }),
      this.restaurant.listReservations(actorId, correlationId),
      this.healthcare.listAppointments(actorId, correlationId),
    ]);
    const names = ['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'] as const;
    const unavailable: string[] = [];
    const items: HistoryItem[] = [];
    responses.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'rejected') {
        unavailable.push(name);
        return;
      }
      for (const value of extractItems(result.value)) items.push(normalizeHistoryItem(name, value));
    });
    items.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    if (!items.length && unavailable.length === names.length) throw new ServiceUnavailableException({ code: 'HISTORY_UNAVAILABLE', detail: 'Lịch sử đang tạm thời chưa sẵn sàng.', retryable: true });
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
  list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.history.list(request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
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
  const timestamp = String(resource.updated_at ?? resource.created_at ?? resource.start_at ?? slot?.start_time ?? new Date(0).toISOString());
  const status = String(resource.status ?? 'UNKNOWN');
  const title = type === 'food_order' ? 'Đơn giao đồ ăn' : type === 'ride_booking' ? 'Chuyến xe' : type === 'restaurant_reservation' ? 'Đặt bàn' : 'Lịch khám';
  const restaurant = isObject(resource.restaurant) ? resource.restaurant : undefined;
  const doctor = isObject(resource.doctor) ? resource.doctor : undefined;
  const department = isObject(resource.department) ? resource.department : undefined;
  const detail = type === 'food_order' ? String(restaurant?.name ?? restaurant?.id ?? `Mã ${id}`) : type === 'ride_booking' ? `${String(resource.pickup_address ?? '')} → ${String(resource.dropoff_address ?? '')}` : type === 'restaurant_reservation' ? String(resource.restaurant_name ?? resource.restaurant_id ?? `Mã ${id}`) : String(doctor?.name ?? department?.name ?? `Mã ${id}`);
  return { id, type, title, status, detail, timestamp, source: type, resource };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Module({ imports: [AuthModule, PaymentModule], controllers: [HistoryController], providers: [HistoryService] })
export class HistoryModule {}
