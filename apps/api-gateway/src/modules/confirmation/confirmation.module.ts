import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CoreModule } from '../core/core.module';
import { PaymentModule } from '../payment/payment.module';
import { FoodClient } from '../../clients/service.clients';
import { ConfirmationController } from './confirmation.controller';
import { ConfirmationService } from './confirmation.service';

@Module({ imports: [AuthModule, CoreModule, PaymentModule], controllers: [ConfirmationController], providers: [ConfirmationService, FoodClient], exports: [ConfirmationService] })
export class ConfirmationModule {}
