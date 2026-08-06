import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { PaymentService } from './payment.service';

@Controller('api/v1/payments')
@UseGuards(DemoAuthGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get(':paymentId')
  async get(@Param('paymentId') paymentId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.payments.get(paymentId, request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Get(':paymentId/receipt')
  async receipt(@Param('paymentId') paymentId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.payments.receipt(paymentId, request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Get(':paymentId/refunds')
  async refunds(@Param('paymentId') paymentId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.payments.refunds(paymentId, request.user.sub), meta: { request_id: request.correlationId } };
  }
}
