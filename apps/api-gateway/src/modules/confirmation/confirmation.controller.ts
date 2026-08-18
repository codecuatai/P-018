import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from './confirmation.service';

@Controller('api/v1/confirmations')
@UseGuards(AuthGuard)
export class ConfirmationController {
  constructor(private readonly confirmations: ConfirmationService) {}

  @Post('food-order')
  async prepare(@Body() body: Record<string, unknown>, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.confirmations.prepare(request.user, body, request.correlationId ?? 'cor_unknown'), meta: { request_id: request.correlationId } };
  }

  @Post('food-order-cancellation')
  async prepareCancellation(@Body() body: { order_id: string }, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.confirmations.prepareCancellation(request.user, body.order_id, request.correlationId ?? 'cor_unknown'), meta: { request_id: request.correlationId } };
  }

  @Post('restaurant-reservation')
  async prepareRestaurant(@Body() body: Record<string, unknown>, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (typeof body.restaurant_id !== 'string' || typeof body.hold_id !== 'string' || !Number.isInteger(Number(body.party_size)) || typeof body.start_at !== 'string') {
      throw new BadRequestException({ code: 'RESERVATION_PAYLOAD_INVALID', detail: 'Restaurant, hold, party size and time are required.', retryable: false });
    }
    const workflowId = `web_restaurant_${randomUUID()}`;
    const tool = {
      tool_name: 'restaurant.create_reservation' as const,
      risk_level: 'FINANCIAL_OR_FINAL' as const,
      arguments: {
        restaurant_id: body.restaurant_id,
        hold_id: body.hold_id,
        party_size: Number(body.party_size),
        start_at: body.start_at,
        duration_minutes: Number(body.duration_minutes ?? 120),
        ...(typeof body.special_requests === 'string' && body.special_requests.trim() ? { special_requests: body.special_requests.trim() } : {}),
      },
      workflow_id: workflowId,
      tool_call_id: `web_call_${randomUUID()}`,
      schema_version: '2',
      idempotency_key: `web:restaurant:${workflowId}`,
    };
    const data = await this.confirmations.prepareDomainConfirmation(request.user, tool, undefined, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post('healthcare-appointment')
  async prepareHealthcare(@Body() body: { appointment_id?: number }, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const appointmentId = Number(body.appointment_id);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'Appointment id không hợp lệ.', retryable: false });
    const workflowId = `web_healthcare_${randomUUID()}`;
    const tool = {
      tool_name: 'healthcare.confirm_appointment' as const,
      risk_level: 'FINANCIAL_OR_FINAL' as const,
      arguments: { appointment_id: appointmentId },
      workflow_id: workflowId,
      tool_call_id: `web_call_${randomUUID()}`,
      schema_version: '2',
      idempotency_key: `web:healthcare:${workflowId}`,
    };
    const data = await this.confirmations.prepareDomainConfirmation(request.user, tool, undefined, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Get(':confirmationId')
  async get(@Param('confirmationId') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.confirmations.get(id, request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Post(':confirmationId/execute')
  execute(@Param('confirmationId') id: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.confirmations.execute(id, request.user, body, request.correlationId ?? 'cor_unknown', idempotencyKey ?? `cnf:${id}`).then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Post(':confirmationId/execute-cancellation')
  async executeCancellation(@Param('confirmationId') id: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: { conversation_id?: string }, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.confirmations.executeCancellation(id, request.user, request.correlationId ?? 'cor_unknown', idempotencyKey ?? `cancel:${id}`, body.conversation_id), meta: { request_id: request.correlationId } };
  }
}
