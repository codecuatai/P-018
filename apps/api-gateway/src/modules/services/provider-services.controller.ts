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
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { createHash, randomUUID } from 'crypto';

import { FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ProviderOfferingsStore, ProviderServiceItemRecord } from './provider-offerings.store';

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
  @IsString()
  @IsIn(['ride_driver', 'restaurant_merchant', 'healthcare_doctor'])
  provider_type?: 'ride_driver' | 'restaurant_merchant' | 'healthcare_doctor';
}

class CreateProviderItemDto {
  @IsString()
  @IsIn(['ride', 'food', 'restaurant', 'healthcare'])
  domain!: 'ride' | 'food' | 'restaurant' | 'healthcare';

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

@Controller('api/v1/provider/services')
@UseGuards(AuthGuard)
export class ProviderServicesController {
  constructor(
    private readonly store: ProviderOfferingsStore,
    private readonly ride: RideClient,
    private readonly food: FoodClient,
    private readonly healthcare: HealthcareClient,
    private readonly restaurant: RestaurantClient,
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
      providerType: body.provider_type,
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
    const isMaster = request.user.email === 'provider@xone.local' || request.user.tenant_id === 'partner-xone-01';
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
    try {
      const raw = await this.ride.opsTransactions(correlationId, 50, 0);
      const items = extractOpsItems(raw);
      return { data: { items, count: items.length }, meta: { request_id: correlationId } };
    } catch {
      return { data: { items: [], count: 0 }, meta: { request_id: correlationId } };
    }
  }

  @Get('operations/orders')
  async getOperationalOrders(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_orders';
    try {
      const raw = await this.food.opsTransactions(correlationId, 50, 0);
      const items = extractOpsItems(raw);
      return { data: { items, count: items.length }, meta: { request_id: correlationId } };
    } catch {
      return { data: { items: [], count: 0 }, meta: { request_id: correlationId } };
    }
  }

  @Get('operations/appointments')
  async getOperationalAppointments(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const correlationId = request.correlationId ?? 'cor_provider_appts';
    try {
      const raw = await this.healthcare.opsTransactions(correlationId, 50, 0);
      const items = extractOpsItems(raw);
      return { data: { items, count: items.length }, meta: { request_id: correlationId } };
    } catch {
      return { data: { items: [], count: 0 }, meta: { request_id: correlationId } };
    }
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

    return { data: { created: true, domain }, meta: { request_id: correlationId } };
  }
}
