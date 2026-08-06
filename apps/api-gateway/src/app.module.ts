import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentClient, FoodClient, HealthcareClient, RestaurantClient, RideClient } from './clients/service.clients';
import { validateEnvironment } from './config/environment';
import { AuditModule } from './modules/audit/audit.module';
import { ConfirmationModule } from './modules/confirmation/confirmation.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ToolModule } from './modules/tools/tool.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment }),
    HealthModule,
    ConversationModule,
    WorkflowModule,
    ConfirmationModule,
    PaymentModule,
    ToolModule,
    AuditModule,
  ],
  providers: [AgentClient, RideClient, RestaurantClient, HealthcareClient, FoodClient],
  exports: [AgentClient, RideClient, RestaurantClient, HealthcareClient, FoodClient],
})
export class AppModule {}
