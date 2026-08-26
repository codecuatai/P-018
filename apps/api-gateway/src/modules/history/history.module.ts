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

const SCHEDULED_HISTORY_TYPES = new Set<HistoryType>(['restaurant_reservation', 'healthcare_appointment']);
const SCHEDULED_STATUS_FIELDS = ['reservation_time', 'booking_time', 'appointment_time', 'start_at', 'start_time', 'scheduled_at'] as const;

/**
 * Active history is a read-model concern. It must not mutate the owning
 * service, and scheduled resources need a conservative time check so a
 * non-terminal reservation/appointment does not remain active forever.
 */
export function isHistoryResourceActive(type: HistoryType, resource: JsonObject, now: Date = new Date()): boolean {
  const status = String(resource.status ?? '').trim().toUpperCase();
  if (TERMINAL_HISTORY_STATUSES[type].has(status)) return false;
  if (!SCHEDULED_HISTORY_TYPES.has(type)) return true;

  const scheduled = scheduledHistoryTimestamp(resource);
  if (!scheduled) return false;
  const scheduledAt = parseHistoryTimestamp(scheduled);
  return Number.isFinite(scheduledAt) && Number.isFinite(now.getTime()) && scheduledAt > now.getTime();
}

function scheduledHistoryTimestamp(resource: JsonObject): string | undefined {
  for (const field of SCHEDULED_STATUS_FIELDS) {
    const value = resource[field];
    if (typeof value === 'string') return value;
  }
  if (isObject(resource.slot)) {
    for (const field of ['start_at', 'start_time', 'appointment_time'] as const) {
      const value = resource.slot[field];
      if (typeof value === 'string') return value;
    }
  }
  return undefined;
}

function parseHistoryTimestamp(value: string): number {
  const raw = value.trim();
  if (!raw) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00+07:00`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? raw
      : `${raw}+07:00`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

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
    const now = new Date();
    responses.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'rejected') {
        unavailable.push(name);
        return;
      }
      for (const value of extractItems(result.value)) {
        const normalized = normalizeHistoryItem(name, value);
        if (isHistoryResourceActive(name, value, now)) items.push(normalized);
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
      const publicOrder = publicHistoryResource(type, order);
      return payment ? { ...publicOrder, payment } : publicOrder;
    }
    if (type === 'ride_booking') return this.ride.getBooking(actorId, { correlationId }, id).then((value) => publicHistoryResource(type, value as unknown as JsonObject));
    if (type === 'restaurant_reservation') return this.restaurant.getReservation(id, actorId, correlationId).then((value) => publicHistoryResource(type, value));
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) throw new BadRequestException({ code: 'HISTORY_ID_INVALID', detail: 'Mã lịch khám không hợp lệ.', retryable: false });
    return this.healthcare.getAppointment(appointmentId, actorId, correlationId).then((value) => publicHistoryResource(type, value));
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
  return { id, type, title, status, detail, timestamp, source: type, resource: publicHistoryResource(type, resource) };
}

function moneyText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${formatAmount(value)} VND`;
  if (isObject(value) && typeof value.amount === 'number' && Number.isFinite(value.amount)) return `${formatAmount(value.amount)} ${typeof value.currency === 'string' ? value.currency : 'VND'}`;
  return '';
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function publicHistoryResource(type: HistoryType, resource: JsonObject): JsonObject {
  const result = pickFields(resource, type === 'ride_booking'
    ? ['status', 'pickup_address', 'dropoff_address', 'pickup', 'dropoff', 'pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 'dropoff_longitude', 'vehicle_type', 'passenger_count', 'capacity_policy_version', 'vehicle', 'fare', 'amount', 'currency', 'distance_km', 'duration_minutes', 'route_distance_meters', 'route_duration_seconds', 'route_polyline']
    : type === 'food_order'
      ? ['status', 'restaurant_name', 'delivery_address', 'image_url', 'total', 'amount', 'currency']
      : type === 'restaurant_reservation'
        ? ['status', 'name', 'restaurant_name', 'address', 'location', 'reservation_time', 'start_at', 'booking_time', 'party_size', 'image_url']
        : ['appointment_id', 'status', 'is_paid', 'patient_id', 'facility_name', 'address', 'department', 'department_name', 'doctor_name', 'doctor_id', 'slot_id', 'start_time', 'appointment_time', 'price', 'amount', 'currency', 'image_url']);

  if (type === 'ride_booking') {
    const driver = publicDriver(resource.driver);
    if (driver) result.driver = driver;
    const driverLocation = publicPoint(resource.driver_location) ?? publicPointFromFields(resource.driver_latitude, resource.driver_longitude);
    const currentLocation = publicPoint(resource.current_location) ?? publicPointFromFields(resource.current_latitude, resource.current_longitude);
    if (driverLocation) result.driver_location = driverLocation;
    if (currentLocation) result.current_location = currentLocation;
    const route = publicRoute(resource.route);
    const geometry = publicGeometry(resource.route_geometry);
    if (route) result.route = route;
    else if (geometry.length > 1) {
      const origin = publicPointFromFields(resource.pickup_latitude, resource.pickup_longitude);
      const destination = publicPointFromFields(resource.dropoff_latitude, resource.dropoff_longitude);
      result.route = {
        ...(origin ? { origin } : {}),
        ...(destination ? { destination } : {}),
        ...(typeof resource.route_distance_meters === 'number' ? { distance_meters: resource.route_distance_meters } : {}),
        ...(typeof resource.route_duration_seconds === 'number' ? { duration_seconds: resource.route_duration_seconds } : {}),
        geometry,
      };
    }
  } else if (type === 'food_order') {
    const restaurant = publicPlace(resource.restaurant);
    if (restaurant) result.restaurant = restaurant;
    if (Array.isArray(resource.items)) result.items = resource.items.filter(isObject).map(publicFoodItem);
    const delivery = isObject(resource.delivery) ? resource.delivery : undefined;
    const pickupSource = Array.isArray(delivery?.pickup_stops)
      ? delivery.pickup_stops
      : Array.isArray(resource.restaurants)
        ? resource.restaurants
        : restaurant ? [restaurant] : [];
    const pickupStops = pickupSource.filter(isObject).map(publicPlace).filter((place): place is JsonObject => Boolean(place));
    if (pickupStops.length) result.pickup_stops = pickupStops;
    if (Array.isArray(resource.restaurants)) result.restaurants = resource.restaurants.filter(isObject).map(publicPlace).filter((place): place is JsonObject => Boolean(place));
    const addressSource = isObject(resource.address) ? resource.address : undefined;
    const deliveryAddress = stringField(addressSource?.address ?? addressSource?.address_text) ?? stringField(resource.delivery_address);
    const addressPoint = publicPointFromFields(addressSource?.latitude, addressSource?.longitude);
    if (deliveryAddress) result.delivery_address = deliveryAddress;
    if (addressPoint) result.delivery_location = addressPoint;
    const routePoints = [
      ...pickupStops.map((stop) => publicPoint(stop.location)).filter((point): point is { latitude: number; longitude: number } => Boolean(point)),
      ...(addressPoint ? [addressPoint] : []),
    ];
    if (routePoints.length > 1) result.delivery_route = { origin: routePoints[0], destination: routePoints[routePoints.length - 1], geometry: routePoints };
    const driver = publicDriver(resource.driver);
    if (driver) result.driver = driver;
  } else if (type === 'restaurant_reservation') {
    const restaurant = publicPlace(resource.restaurant);
    if (restaurant) result.restaurant = restaurant;
    const point = publicPoint(resource.location) ?? publicPointFromFields(resource.latitude, resource.longitude);
    if (point) result.location = point;
  } else {
    const facilitySource = isObject(resource.facility) ? resource.facility : isObject(resource.doctor) && isObject(resource.doctor.facility) ? resource.doctor.facility : undefined;
    const facility = publicPlace(facilitySource);
    if (facility) result.facility = facility;
    const doctor = publicPerson(resource.doctor);
    if (doctor) result.doctor = doctor;
    const department = publicPerson(resource.department);
    if (department) result.department = department;
    const patient = publicPerson(resource.patient);
    if (patient) result.patient = patient;
    const facilityName = stringField(resource.facility_name) ?? stringField(facility?.name);
    const facilityAddress = stringField(resource.address) ?? stringField(facility?.address);
    const doctorName = stringField(resource.doctor_name) ?? stringField(doctor?.name);
    const departmentName = stringField(resource.department_name) ?? stringField(resource.department) ?? stringField(department?.name);
    const patientName = stringField(resource.patient_name) ?? stringField(patient?.name);
    const slot = isObject(resource.slot) ? resource.slot : undefined;
    const startTime = stringField(resource.start_time) ?? stringField(resource.start_at) ?? stringField(slot?.start_time);
    const price = typeof resource.price === 'number' ? resource.price : typeof doctor?.price === 'number' ? doctor.price : undefined;
    if (facilityName) result.facility_name = facilityName;
    if (facilityAddress) result.address = facilityAddress;
    if (doctorName) result.doctor_name = doctorName;
    if (departmentName) result.department_name = departmentName;
    if (patientName) result.patient_name = patientName;
    if (startTime) result.start_time = startTime;
    if (price !== undefined) result.price = price;
    if (slot) result.slot = pickFields(slot, ['id', 'start_time', 'end_time', 'status', 'hold_expires_at']);
    const point = publicPoint(resource.location) ?? publicPointFromFields(resource.latitude, resource.longitude) ?? publicPoint(facility?.location);
    if (point) result.location = point;
  }
  return result;
}

function pickFields(resource: JsonObject, fields: string[]): JsonObject {
  const result: JsonObject = {};
  for (const field of fields) {
    const value = resource[field];
    if (value !== undefined && value !== null) result[field] = value;
  }
  return result;
}

function publicPlace(value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const result = pickFields(value, ['name', 'title', 'address', 'city', 'district', 'ward', 'cuisine', 'description', 'rating', 'review_count', 'price_level', 'image_url', 'opening_hours']);
  const point = value.coordinate_status === 'suspicious_default' ? undefined : publicPoint(value.location) ?? publicPointFromFields(value.latitude, value.longitude);
  if (point) result.location = point;
  return Object.keys(result).length ? result : undefined;
}

function publicFoodItem(value: JsonObject): JsonObject {
  return pickFields(value, ['name', 'title', 'description', 'price', 'currency', 'quantity', 'image_url']);
}

function publicPerson(value: unknown): JsonObject | undefined {
  if (typeof value === 'string' && value.trim()) return { name: value.trim() };
  if (!isObject(value)) return undefined;
  const result = pickFields(value, ['name', 'full_name', 'display_name', 'title', 'specialty', 'description', 'price']);
  return Object.keys(result).length ? result : undefined;
}

function publicDriver(value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const result = pickFields(value, ['name', 'full_name', 'display_name', 'rating', 'rating_average', 'phone_masked', 'vehicle_type', 'vehicle_model', 'vehicle_color', 'license_plate', 'eta_seconds']);
  const phone = typeof value.phone === 'string' ? maskPhone(value.phone) : undefined;
  if (!result.phone_masked && phone) result.phone_masked = phone;
  if (isObject(value.vehicle)) {
    const vehicle = pickFields(value.vehicle, ['type', 'vehicle_type', 'make', 'model', 'vehicle_model', 'color', 'vehicle_color', 'license_plate']);
    if (Object.keys(vehicle).length) result.vehicle = vehicle;
  }
  return Object.keys(result).length ? result : undefined;
}

function publicRoute(value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const geometry = publicGeometry(value.geometry);
  const origin = publicPoint(value.origin);
  const destination = publicPoint(value.destination);
  const result: JsonObject = {
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...(typeof value.distance_meters === 'number' ? { distance_meters: value.distance_meters } : {}),
    ...(typeof value.duration_seconds === 'number' ? { duration_seconds: value.duration_seconds } : {}),
    ...(typeof value.polyline === 'string' ? { polyline: value.polyline } : {}),
    ...(geometry.length > 1 ? { geometry } : {}),
  };
  return Object.keys(result).length ? result : undefined;
}

function publicGeometry(value: unknown): Array<{ latitude: number; longitude: number }> {
  if (!Array.isArray(value)) return [];
  return value.map(publicPoint).filter((point): point is { latitude: number; longitude: number } => Boolean(point));
}

function publicPoint(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!isObject(value)) return undefined;
  return publicPointFromFields(value.latitude, value.longitude);
}

function publicPointFromFields(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
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
