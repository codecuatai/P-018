import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { PaymentController } from './payment.controller';
import { PaymentService, SandboxPaymentProvider } from './payment.service';

@Module({ imports: [CoreModule], controllers: [PaymentController], providers: [PaymentService, SandboxPaymentProvider], exports: [PaymentService] })
export class PaymentModule {}
