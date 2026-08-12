import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClientsModule } from './clients/clients.module';
import { validateEnvironment } from './config/environment';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfirmationModule } from './modules/confirmation/confirmation.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ToolModule } from './modules/tools/tool.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { CoreModule } from './modules/core/core.module';
import { PersonalModule } from './modules/personal/personal.module';
import { HistoryModule } from './modules/history/history.module';
import { ServicesModule } from './modules/services/services.module';
import { ReliabilityModule } from './modules/workflow/reliability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment }),
    ClientsModule,
    HealthModule,
    CoreModule,
    PersonalModule,
    HistoryModule,
    ServicesModule,
    AuthModule,
    ConversationModule,
    WorkflowModule,
    ReliabilityModule,
    ConfirmationModule,
    PaymentModule,
    ToolModule,
    AuditModule,
  ],
})
export class AppModule {}
