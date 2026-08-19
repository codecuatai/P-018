import { BadRequestException, Body, Controller, Headers, Param, Post, Patch, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength, IsEnum } from 'class-validator';
import { createHash } from 'crypto';

import { ConfirmationEvidence, RideClient, RideQuote } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';

enum RideBookingStatus {
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  AWAITING_PAYMENT_CONFIRMATION = 'AWAITING_PAYMENT_CONFIRMATION',
  SEARCHING_DRIVER = 'SEARCHING_DRIVER',
  DRIVER_ASSIGNED = 'DRIVER_ASSIGNED',
  DRIVER_TO_PICKUP = 'DRIVER_TO_PICKUP',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  ARRIVED_DESTINATION = 'ARRIVED_DESTINATION',
  COMPLETED = 'COMPLETED',
  NO_DRIVER = 'NO_DRIVER',
  FAILED = 'FAILED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED'
}

class UpdateRideStatusDto {
  @IsEnum(RideBookingStatus)
  status!: string;
}

class RideQuoteReferenceDto {
  @IsString()
  @MinLength(1)
  quote_id!: string;
}

function requiredKey(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho thao tác Ride.', retryable: false });
  return value.trim();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function evidence(actorId: string, key: string, action: string, payload: Record<string, unknown>, quote: RideQuote): ConfirmationEvidence {
  const now = Date.now();
  return {
    confirmation_id: `web_confirmation_${digest(`${actorId}|${action}|${key}`).slice(0, 32)}`,
    actor_id: actorId,
    action,
    payload_hash: digest(canonicalJson(payload)),
    quote_version: quote.quote_version,
    amount: quote.amount,
    currency: quote.currency,
    issued_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 5 * 60_000).toISOString(),
  };
}

@Controller('api/v1/service-actions/ride')
@UseGuards(AuthGuard)
export class RideActionsController {
  constructor(private readonly ride: RideClient) {}

  @Post('prepare')
  async prepare(@Body() body: RideQuoteReferenceDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = requiredKey(idempotencyKey);
    const quote = await this.ride.getQuote(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${body.quote_id}`, toolCallId: 'web_prepare' }, body.quote_id);
    const payload = { action: 'ride.booking.prepare', actor_id: request.user.sub, quote_id: quote.id, quote_version: quote.quote_version, amount: quote.amount, currency: quote.currency, passenger_count: quote.passenger_count, capacity_policy_version: quote.capacity_policy_version };
    const booking = await this.ride.prepareBooking(request.user.sub, key, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${quote.id}`, toolCallId: 'web_prepare' }, JSON.stringify({ quote_id: quote.id, confirmation: evidence(request.user.sub, key, 'ride.booking.prepare', payload, quote) }));
    return { data: booking, meta: { request_id: request.correlationId } };
  }


  @Patch(':bookingId/status')
  async updateStatus(@Param('bookingId') bookingId: string, @Body() body: UpdateRideStatusDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = requiredKey(idempotencyKey);
    const payload = { status: body.status };
    const updated = await this.ride.updateBookingStatus(request.user.sub, key, {
      correlationId: request.correlationId ?? 'cor_unknown',
      workflowId: `web_ride_${bookingId}`,
      toolCallId: 'web_status_update',
    }, bookingId, payload);
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Post(':bookingId/confirm')
  async confirm(@Param('bookingId') bookingId: string, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = requiredKey(idempotencyKey);
    const booking = await this.ride.getBooking(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_confirm_read' }, bookingId);
    const quote = await this.ride.getQuote(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_confirm_quote' }, booking.quote_id);
    const paymentReference = `pay_ride_${digest(`${request.user.sub}|${booking.id}`).slice(0, 24)}`;
    const payload = { action: 'ride.booking.confirm', actor_id: request.user.sub, booking_id: booking.id, quote_id: booking.quote_id, quote_version: booking.quote_version, amount: booking.amount, currency: booking.currency, payment_reference: paymentReference, passenger_count: booking.passenger_count, capacity_policy_version: booking.capacity_policy_version };
    const confirmed = await this.ride.confirmBooking(request.user.sub, key, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_confirm' }, booking.id, JSON.stringify({ payment_reference: paymentReference, confirmation: evidence(request.user.sub, key, 'ride.booking.confirm', payload, quote) }));
    return { data: confirmed, meta: { request_id: request.correlationId } };
  }

  @Post(':bookingId/cancel')
  async cancel(@Param('bookingId') bookingId: string, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = requiredKey(idempotencyKey);
    const booking = await this.ride.getBooking(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_cancel_read' }, bookingId);
    const quote = await this.ride.getQuote(request.user.sub, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_cancel_quote' }, booking.quote_id);
    const payload = { action: 'ride.booking.cancel', actor_id: request.user.sub, booking_id: booking.id, quote_version: booking.quote_version, amount: booking.amount, currency: booking.currency, resource_version: booking.resource_version };
    const cancelled = await this.ride.cancelBooking(request.user.sub, key, { correlationId: request.correlationId ?? 'cor_unknown', workflowId: `web_ride_${bookingId}`, toolCallId: 'web_cancel' }, booking.id, JSON.stringify({ confirmation: evidence(request.user.sub, key, 'ride.booking.cancel', payload, quote) }));
    return { data: cancelled, meta: { request_id: request.correlationId } };
  }
}
