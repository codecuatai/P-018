import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CoreModule } from '../core/core.module';
import { PaymentModule } from '../payment/payment.module';
import { PersonalModule } from '../personal/personal.module';
import { FoodClient, HealthcareClient, RestaurantClient } from '../../clients/service.clients';
import { ConfirmationController } from './confirmation.controller';
import { ConfirmationService } from './confirmation.service';

@Module({ imports: [AuthModule, CoreModule, PaymentModule, PersonalModule], controllers: [ConfirmationController], providers: [ConfirmationService, FoodClient, RestaurantClient, HealthcareClient], exports: [ConfirmationService] })
export class ConfirmationModule {}
