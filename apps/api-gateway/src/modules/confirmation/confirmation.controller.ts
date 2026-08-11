import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';

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
