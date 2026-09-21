import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { createHash, createHmac, randomUUID } from 'crypto';

import { DeliveryClient, FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ProviderAssignmentStatus, ProviderOfferingsStore, ProviderServiceItemRecord } from './provider-offerings.store';

class TestWebhookDto {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

function extractOpsItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (obj.data && typeof obj.data === 'object') {
    const nested = obj.data as Record<string, unknown>;
    if (Array.isArray(nested.items)) return nested.items as Record<string, unknown>[];
  }
  return [];
}


class UpdateProviderProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhook_url?: string;

  @IsOptional()
  @IsBoolean()
  is_open?: boolean;

  @IsOptional()
  @IsObject()
  connected_services?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  @IsIn(['ride_driver', 'restaurant_merchant', 'healthcare_doctor', 'delivery_courier'])
  provider_type?: 'ride_driver' | 'restaurant_merchant' | 'healthcare_doctor' | 'delivery_courier';
}

class CreateProviderItemDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{2,40}$/)
  domain!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

class ToggleItemStatusDto {
  @IsBoolean()
  is_available!: boolean;
}

class UpdateAvailabilityDto {
  @IsOptional()
  @IsBoolean()
  is_online?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  service_areas?: string[];

  @IsOptional()
  @IsObject()
  schedule?: Record<string, { start: string; end: string }>;
}

class CreateProviderDocumentDto {
  @IsString()
  @MaxLength(80)
  document_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  document_url?: string;

  @IsOptional()
  @IsString()
  expires_at?: string;
}

@Controller('api/v1/provider/services')
@UseGuards(AuthGuard)
export class ProviderServicesController {
  constructor(
    private readonly store: ProviderOfferingsStore,
    private readonly ride: RideClient,
    private readonly food: FoodClient,
    private readonly healthcare: HealthcareClient,
    private readonly restaurant: RestaurantClient,
    private readonly delivery: DeliveryClient,
  ) {}

  private assertProvider(user: AuthUser): void {
    if (user.role !== 'provider') {
      throw new ForbiddenException({
        code: 'PROVIDER_ACCESS_REQUIRED',
        detail: 'Chức năng chỉ dành cho đối tác cung cấp dịch vụ.',
        retryable: false,
      });
    }
  }

  private isMasterProvider(user: AuthUser): boolean {
    return (user.email === 'provider1@xone.local' || user.tenant_id === 'partner-xone-01') && user.email !== 'provider@xone.local';
  }

  private operationActor(user: AuthUser): string | undefined {
    return this.isMasterProvider(user) ? undefined : user.sub;
  }

  @Get('profile')
  async getProfile(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    let profile = await this.store.getProfile(userId);
    if (!profile) {
      profile = await this.store.upsertProfile(userId, {
        providerType: request.user.provider_type || 'ride_driver',
        businessName: request.user.full_name || request.user.email.split('@')[0],
        phone: request.user.phone,
        status: 'active',
        isOpen: true,
      });
    }
    return { data: profile, meta: { request_id: request.correlationId } };
  }

  @Put('profile')
  async updateProfile(
    @Body() body: UpdateProviderProfileDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const updated = await this.store.upsertProfile(userId, {
      businessName: body.business_name,
      description: body.description,
      address: body.address,
      phone: body.phone,
      webhookUrl: body.webhook_url,
      isOpen: body.is_open,
      connectedServices: body.connected_services,
      providerType: body.provider_type,
    });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Get('availability')
  async getAvailability(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    return { data: await this.store.getAvailability(request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Put('availability')
  async updateAvailability(@Body() body: UpdateAvailabilityDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const schedule = body.schedule;
    if (schedule) {
      for (const [day, value] of Object.entries(schedule)) {
        if (!/^(mon|tue|wed|thu|fri|sat|sun)$/i.test(day) || !/^\d{2}:\d{2}$/.test(value.start) || !/^\d{2}:\d{2}$/.test(value.end)) {
          throw new BadRequestException({ code: 'AVAILABILITY_INVALID', detail: 'Lịch làm việc phải dùng ngày mon..sun và giờ HH:mm.', retryable: false });
        }
      }
    }
    const updated = await this.store.upsertAvailability(request.user.sub, { isOnline: body.is_online, serviceAreas: body.service_areas, schedule });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Get('documents')
  async documents(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const items = await this.store.listDocuments(request.user.sub);
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId } };
  }

  @Post('documents')
  async createDocument(@Body() body: CreateProviderDocumentDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const now = new Date().toISOString();
    const document = await this.store.createDocument({
      id: `pdoc_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      providerId: request.user.sub,
      documentType: body.document_type.trim(),
      status: 'PENDING',
      documentUrl: body.document_url?.trim(),
      expiresAt: body.expires_at ? new Date(body.expires_at).toISOString() : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { data: document, meta: { request_id: request.correlationId } };
  }

  @Get('assignments')
  async assignments(@Query('status') status: ProviderAssignmentStatus | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const items = await this.store.listAssignments({ providerId: request.user.sub, status });
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId } };
  }

  @Patch('assignments/:id/status')
  async updateAssignmentStatus(@Param('id') id: string, @Body() body: { status: ProviderAssignmentStatus }, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const owned = (await this.store.listAssignments({ providerId: request.user.sub })).find((item) => item.id === id);
    if (!owned) throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', detail: 'Assignment không tồn tại hoặc không thuộc provider hiện tại.', retryable: false });
    const allowed: Record<ProviderAssignmentStatus, ProviderAssignmentStatus[]> = {
      OFFERED: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], REJECTED: [], CANCELLED: [],
    };
    if (!allowed[owned.status].includes(body.status)) throw new BadRequestException({ code: 'ASSIGNMENT_TRANSITION_INVALID', detail: `Không thể chuyển ${owned.status} sang ${body.status}.`, retryable: false });
    const updated = await this.store.updateAssignment(id, { status: body.status });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Patch('channels/:channel/toggle')
  async toggleChannel(
    @Param('channel') channel: string,
    @Body() body: { enabled: boolean },
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const normalizedChannel = channel.trim().toLowerCase();
    const channelPattern = /^[a-z0-9_-]{2,40}$/;
    if (!channelPattern.test(normalizedChannel)) {
      throw new BadRequestException({
        code: 'INVALID_CHANNEL',
        detail: 'Tên định danh kênh dịch vụ không hợp lệ (phải từ 2-40 ký tự gồm chữ thường, số, gạch nối hoặc gạch dưới).',
      });
    }
    const userId = request.user.sub;
    const profile = await this.store.getProfile(userId);
    const currentServices = profile?.connectedServices || { ride: true, food: true, restaurant: true, healthcare: true };
    const updatedServices = { ...currentServices, [normalizedChannel]: Boolean(body.enabled) };
    const updated = await this.store.upsertProfile(userId, {
      connectedServices: updatedServices,
    });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Delete('channels/:channel')
  async removeChannel(
    @Param('channel') channel: string,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const normalizedChannel = channel.trim().toLowerCase();
    const userId = request.user.sub;
    const profile = await this.store.getProfile(userId);
    const currentServices = { ...(profile?.connectedServices || { ride: true, food: true, restaurant: true, healthcare: true }) };
    delete currentServices[normalizedChannel];
    const updated = await this.store.upsertProfile(userId, {
      connectedServices: currentServices,
    });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Get('items')
  async listItems(
    @Query('domain') domain: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const items = await this.store.listItems(userId, domain);
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId } };
  }

  @Post('items')
  async createItem(
    @Body() body: CreateProviderItemDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;

    // Check domain permissions: Master provider (@xone.local) can manage all domains.
    // Scoped providers are restricted to their registered domain.
    const isMaster = this.isMasterProvider(request.user);
    if (!isMaster) {
      const profile = await this.store.getProfile(userId);
      const pType = profile?.providerType || request.user.provider_type;
      if (pType) {
        const allowedDomainsMap: Record<string, string[]> = {
          restaurant_merchant: ['food', 'restaurant'],
          food: ['food', 'restaurant'],
          ride_driver: ['ride'],
          ride: ['ride'],
          healthcare_doctor: ['healthcare'],
          healthcare: ['healthcare'],
          delivery_courier: ['delivery'],
          delivery: ['delivery'],
        };
        const allowed = allowedDomainsMap[pType];
        if (allowed && !allowed.includes(body.domain)) {
          throw new BadRequestException({
            code: 'DOMAIN_NOT_PERMITTED',
            detail: `Đối tác ngành ${pType} chỉ được phép gắn dịch vụ thuộc phạm vi: ${allowed.join(', ')}.`,
            retryable: false,
          });
        }
      }
    }

    const now = new Date().toISOString();
    const item: ProviderServiceItemRecord = {
      id: randomUUID(),
      providerId: userId,
      domain: body.domain,
      name: body.name.trim(),
      description: body.description?.trim(),
      price: body.price,
      currency: body.currency || 'VND',
      category: body.category?.trim() || 'Chung',
      metadata: body.metadata || {},
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.createItem(item);
    return { data: created, meta: { request_id: request.correlationId } };
  }

  @Patch('items/:id/status')
  async toggleItemStatus(
    @Param('id') id: string,
    @Body() body: ToggleItemStatusDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const updated = await this.store.toggleItem(userId, id, body.is_available);
    if (!updated) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        detail: 'Không tìm thấy dịch vụ tương ứng.',
        retryable: false,
      });
    }
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Delete('items/:id')
  async deleteItem(
    @Param('id') id: string,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const deleted = await this.store.deleteItem(userId, id);
    if (!deleted) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        detail: 'Không tìm thấy dịch vụ để xóa.',
        retryable: false,
      });
    }
    return { data: { deleted: true, id }, meta: { request_id: request.correlationId } };
  }

  @Get('operations/rides')
  async getOperationalRides(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_rides';
    const raw = await this.ride.opsTransactions(correlationId, 50, 0, this.operationActor(request.user));
    const items = extractOpsItems(raw);
    return { data: { items, count: items.length }, meta: { request_id: correlationId } };
  }

  @Get('operations/orders')
  async getOperationalOrders(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_orders';
    const raw = await this.food.opsTransactions(correlationId, 50, 0, this.operationActor(request.user));
    const items = extractOpsItems(raw);
    return { data: { items, count: items.length }, meta: { request_id: correlationId } };
  }

  @Get('operations/appointments')
  async getOperationalAppointments(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_appts';
    const raw = await this.healthcare.opsTransactions(correlationId, 50, 0, this.operationActor(request.user));
    const items = extractOpsItems(raw);
    return { data: { items, count: items.length }, meta: { request_id: correlationId } };
  }

  @Get('operations/reservations')
  async getOperationalReservations(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_reservations';
    const raw = await this.restaurant.opsTransactions(correlationId, 50, 0, this.operationActor(request.user));
    const items = extractOpsItems(raw);
    return { data: { items, count: items.length }, meta: { request_id: correlationId } };
  }

  @Get('operations/deliveries')
  async getOperationalDeliveries(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_deliveries';
    const raw = await this.delivery.opsTransactions(correlationId, 50, 0, this.operationActor(request.user));
    const items = extractOpsItems(raw);
    return { data: { items, count: items.length }, meta: { request_id: correlationId } };
  }

  @Patch('operations/deliveries/:deliveryId/status')
  async updateOperationalDeliveryStatus(
    @Param('deliveryId') deliveryId: string,
    @Body() body: { status: string },
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_delivery_status';
    const updated = await this.delivery.updateOrderStatus(deliveryId, body.status, correlationId, request.user.sub);
    return { data: updated, meta: { request_id: correlationId } };
  }

  @Patch('operations/rides/:bookingId/status')
  async updateOperationalRideStatus(
    @Param('bookingId') bookingId: string,
    @Body() body: { status: string },
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_ride_status';
    const key = idempotencyKey?.trim() || randomUUID();
    const updated = await this.ride.updateBookingStatus(
      request.user.sub,
      key,
      { correlationId, workflowId: `provider_ride_${bookingId}`, toolCallId: 'provider_status' },
      bookingId,
      { status: body.status },
    );
    return { data: updated, meta: { request_id: correlationId } };
  }

  @Patch('operations/orders/:orderId/status')
  async updateOperationalOrderStatus(
    @Param('orderId') orderId: string,
    @Body() body: { status: string },
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_order_status';
    const key = idempotencyKey?.trim() || randomUUID();
    const updated = await this.food.updateOrderStatus(
      request.user.sub,
      correlationId,
      orderId,
      { status: body.status },
      key,
    );
    return { data: updated, meta: { request_id: correlationId } };
  }

  @Patch('operations/appointments/:appointmentId/status')
  async updateOperationalAppointmentStatus(
    @Param('appointmentId') appointmentId: string,
    @Body() body: { status: string },
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_appt_status';
    const key = idempotencyKey?.trim() || randomUUID();
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'Appointment ID không hợp lệ.' });
    }
    let updated: object;
    if (body.status === 'CANCELLED') {
      updated = await this.healthcare.cancelAppointment(request.user.sub, correlationId, key, id);
    } else {
      updated = await this.healthcare.confirmAppointment(request.user.sub, correlationId, key, id);
    }
    return { data: updated, meta: { request_id: correlationId } };
  }

  @Patch('operations/reservations/:reservationId/status')
  async updateOperationalReservationStatus(
    @Param('reservationId') reservationId: string,
    @Body() body: { status: string },
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_reservation_status';
    const key = idempotencyKey?.trim() || randomUUID();
    let updated: object;
    if (body.status === 'CANCELLED') {
      updated = await this.restaurant.cancelReservation(request.user.sub, correlationId, key, reservationId);
    } else {
      updated = await this.restaurant.updateReservation(request.user.sub, correlationId, key, reservationId, { status: body.status });
    }
    return { data: updated, meta: { request_id: correlationId } };
  }

  @Post('operations/seed-sample')
  async seedOperationalSample(
    @Body() body: { domain: string },
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_seed_sample';
    const domain = body.domain || 'ride';
    const key = randomUUID();

    if (domain === 'ride') {
      const quote = await this.ride.createQuote(
        request.user.sub,
        key,
        { correlationId, workflowId: `seed_quote_${key}` },
        {
          pickup_address: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
          dropoff_address: 'Sân bay Quốc tế Tân Sơn Nhất, Ga T2, Tân Bình',
          vehicle_type: 'CAR_4',
          passenger_count: 2,
        },
      );
      const preparePayload = {
        action: 'ride.booking.prepare',
        actor_id: request.user.sub,
        quote_id: quote.id,
        quote_version: quote.quote_version,
        amount: quote.amount,
        currency: quote.currency,
        passenger_count: quote.passenger_count,
        capacity_policy_version: quote.capacity_policy_version,
      };
      const confirmationEv = {
        confirmation_id: `conf_${key}`,
        actor_id: request.user.sub,
        action: 'ride.booking.prepare',
        payload_hash: createHash('sha256').update(JSON.stringify(preparePayload)).digest('hex'),
        quote_version: quote.quote_version,
        amount: quote.amount,
        currency: quote.currency,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      };
      const booking = await this.ride.prepareBooking(
        request.user.sub,
        key,
        { correlationId, workflowId: `seed_booking_${quote.id}` },
        JSON.stringify({ quote_id: quote.id, confirmation: confirmationEv }),
      );
      return { data: booking, meta: { request_id: correlationId } };
    }

    if (domain === 'food') {
      const restsRaw = await this.food.get('/api/v1/restaurants?limit=5', correlationId, request.user.sub);
      const rests = Array.isArray(restsRaw) ? restsRaw : (restsRaw as any)?.items ?? [];
      if (!rests.length) {
        throw new BadRequestException({ code: 'NO_RESTAURANTS', detail: 'Không có nhà hàng nào để tạo đơn mẫu.', retryable: false });
      }
      const rest = rests[0];
      const cart = await this.food.createCart(request.user.sub, correlationId, `seed_cart_${key}`, rest.id);
      const menuRaw = await this.food.get(`/api/v1/restaurants/${encodeURIComponent(rest.id)}/menu?limit=5`, correlationId, request.user.sub);
      const menuItems = Array.isArray(menuRaw) ? menuRaw : (menuRaw as any)?.items ?? [];
      if (!menuItems.length) {
        throw new BadRequestException({ code: 'NO_MENU_ITEMS', detail: 'Nhà hàng chưa có món để thêm vào giỏ.', retryable: false });
      }
      const item = menuItems[0];
      if (!cart?.id) {
        throw new BadRequestException({ code: 'CART_CREATE_FAILED', detail: 'Không thể tạo giỏ hàng.', retryable: false });
      }
      await this.food.addCartItem(request.user.sub, correlationId, String(cart.id), {
        menu_item_id: item.id,
        quantity: 2,
      }, `seed_item_${key}`);
      const preview = await this.food.post('/api/v1/orders/preview', {
        cart_id: String(cart.id),
        user_id: request.user.sub,
      }, correlationId, undefined, request.user.sub);
      const order = await this.food.post('/api/v1/orders', {
        cart_id: String(cart.id),
        user_id: request.user.sub,
        payment_method: 'card',
        idempotency_key: `seed_ord_${key}`,
        expected_snapshot_hash: (preview as any).snapshot_hash,
        expected_cart_version: (preview as any).cart_version,
        expected_amount: (preview as any).total?.amount,
        expected_currency: (preview as any).total?.currency ?? 'VND',
        expected_quote_version: (preview as any).quote_version,
      }, correlationId, `seed_ord_${key}`, request.user.sub);
      return { data: order, meta: { request_id: correlationId } };
    }

    if (domain === 'healthcare') {
      const departmentsRaw = await this.healthcare.listDepartments(request.user.sub, correlationId, '', 1, 0);
      const deptList = Array.isArray(departmentsRaw) ? departmentsRaw : (departmentsRaw as any)?.items ?? [];
      if (!deptList.length) {
        throw new BadRequestException({ code: 'NO_DEPARTMENTS', detail: 'Không có khoa nào để đặt lịch mẫu.', retryable: false });
      }
      const dept = deptList[0]?.name;
      const slotsRaw = await this.healthcare.listDoctors(request.user.sub, correlationId, dept);
      const slots = Array.isArray(slotsRaw) ? slotsRaw : (slotsRaw as any)?.items ?? [];
      const availSlot = slots[0];
      if (!availSlot?.id) {
        throw new BadRequestException({ code: 'NO_SLOTS', detail: 'Không có lịch khám khả dụng.', retryable: false });
      }
      const held = await this.healthcare.holdSlot(request.user.sub, correlationId, `seed_hold_${key}`, {
        slot_id: availSlot.id,
        symptoms: 'Khám sức khỏe tổng quát định kỳ',
      });
      const apptId = (held as any)?.appointment?.id ?? (held as any)?.id;
      if (!apptId) {
        throw new BadRequestException({ code: 'HOLD_FAILED', detail: 'Không thể giữ lịch khám.', retryable: false });
      }
      await this.healthcare.acknowledgePayment(apptId, request.user.sub, correlationId, `seed_pay_${key}`);
      const confirmed = await this.healthcare.confirmAppointment(request.user.sub, correlationId, `seed_conf_${key}`, apptId);
      return { data: confirmed, meta: { request_id: correlationId } };
    }

    if (domain === 'restaurant') {
      const catalogRaw = await this.restaurant.searchCatalog({ limit: 3 }, correlationId);
      const catalogItems = Array.isArray(catalogRaw) ? catalogRaw : (catalogRaw as any)?.items ?? [];
      if (!catalogItems.length) {
        throw new BadRequestException({ code: 'NO_RESTAURANTS', detail: 'Không có nhà hàng nào trong danh mục.', retryable: false });
      }
      const rest = catalogItems[0];
      const hold = await this.restaurant.createHold(request.user.sub, correlationId, `seed_rhold_${key}`, {
        restaurant_id: rest.id,
        party_size: 4,
        reservation_time: new Date(Date.now() + 7200_000).toISOString(),
        special_requests: 'Bàn cạnh cửa sổ hoặc ban công, tiệc gia đình',
      });
      const holdId = (hold as any)?.hold_id || (hold as any)?.id;
      if (!holdId) {
        throw new BadRequestException({ code: 'HOLD_FAILED', detail: 'Không thể giữ bàn.', retryable: false });
      }
      const providerName = request.user.full_name ?? request.user.email.split('@')[0];
      const providerPhone = request.user.phone ?? undefined;
      const res = await this.restaurant.createReservation(request.user.sub, correlationId, `seed_res_${key}`, {
        hold_id: holdId,
        restaurant_id: rest.id,
        guest_name: providerName,
        guest_phone: providerPhone,
        party_size: 4,
        reservation_time: new Date(Date.now() + 7200_000).toISOString(),
      });
      return { data: res, meta: { request_id: correlationId } };
    }

    if (domain === 'delivery') {
      const seeded = await this.delivery.seedSample('Bưu kiện test từ Provider Portal', correlationId);
      return { data: seeded, meta: { request_id: correlationId } };
    }

    return { data: { created: true, domain }, meta: { request_id: correlationId } };
  }

  @Post('webhook/test')
  async testWebhook(
    @Body() body: TestWebhookDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_webhook_test';
    const profile = await this.store.getProfile(request.user.sub);
    const webhookUrl = profile?.webhookUrl?.trim();
    if (!webhookUrl) {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_MISSING',
        detail: 'Chưa cấu hình Webhook URL trong hồ sơ đối tác.',
        retryable: false,
      });
    }

    try {
      const parsed = new URL(webhookUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Giao thức URL phải là http hoặc https');
      }
      const host = parsed.hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) || host.startsWith('169.254.')) {
        throw new Error('Không được dùng địa chỉ loopback/nội bộ làm Webhook ngoài');
      }
    } catch (e: any) {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK_URL',
        detail: `Webhook URL không hợp lệ: ${e.message}`,
        retryable: false,
      });
    }

    const eventName = body.event || 'food.order.created';
    const samplePayload = body.payload || {
      event: eventName,
      event_id: `evt_test_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      provider_id: request.user.sub,
      test_mode: true,
      data: {
        message: 'Kiểm thử kết nối Webhook từ X-One Cổng Đối Tác.',
        sample_id: `sample_${Date.now()}`,
        status: 'RECEIVED',
      },
    };

    const signature = 'sha256=' + createHmac('sha256', 'xone-webhook-secret-key').update(JSON.stringify(samplePayload)).digest('hex');
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-XOne-Event': eventName,
          'X-XOne-Delivery': randomUUID(),
          'X-XOne-Timestamp': new Date().toISOString(),
          'X-XOne-Signature': signature,
        },
        body: JSON.stringify(samplePayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const text = await response.text();
      return {
        data: {
          success: response.ok,
          status_code: response.status,
          status_text: response.statusText,
          latency_ms: latencyMs,
          signature_sent: signature,
          response_body: text.slice(0, 300),
          target_url: webhookUrl,
          event_sent: eventName,
        },
        meta: { request_id: correlationId },
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      return {
        data: {
          success: false,
          status_code: 0,
          error_message: err.name === 'AbortError' ? 'Webhook request timed out (5000ms)' : (err.message || 'Connection failed'),
          latency_ms: latencyMs,
          target_url: webhookUrl,
          event_sent: eventName,
        },
        meta: { request_id: correlationId },
      };
    }
  }

  @Get('earnings/summary')
  async getEarningsSummary(
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_earnings_summary';

    let totalRidesFare = 0;
    let completedRidesCount = 0;
    try {
      const rawRides = await this.ride.opsTransactions(correlationId, 100, 0, this.operationActor(request.user));
      const rides = extractOpsItems(rawRides);
      for (const ride of rides) {
        if (ride.status === 'COMPLETED') {
          completedRidesCount++;
          totalRidesFare += Number(ride.fare_amount ?? ride.fare ?? 0);
        }
      }
    } catch {
      // fallback
    }

    let totalOrdersAmount = 0;
    let completedOrdersCount = 0;
    try {
      const rawOrders = await this.food.opsTransactions(correlationId, 100, 0, this.operationActor(request.user));
      const orders = extractOpsItems(rawOrders);
      for (const order of orders) {
        if (order.status === 'READY_FOR_PICKUP' || order.status === 'COMPLETED' || order.status === 'DELIVERED') {
          completedOrdersCount++;
          totalOrdersAmount += Number(order.total_amount ?? order.total ?? 0);
        }
      }
    } catch {
      // fallback
    }

    const totalGrossRevenue = totalRidesFare + totalOrdersAmount;
    const platformFeeRate = 0.10; // 10%
    const platformFee = Math.round(totalGrossRevenue * platformFeeRate);
    const netPayout = totalGrossRevenue - platformFee;

    return {
      data: {
        gross_revenue: totalGrossRevenue,
        completed_orders: completedOrdersCount,
        completed_rides: completedRidesCount,
        total_completed_transactions: completedOrdersCount + completedRidesCount,
        platform_fee: platformFee,
        platform_fee_rate: '10%',
        net_payout: netPayout,
        currency: 'VND',
        payout_status: 'AVAILABLE_FOR_SETTLEMENT',
        last_calculated_at: new Date().toISOString(),
      },
      meta: { request_id: correlationId },
    };
  }
}
