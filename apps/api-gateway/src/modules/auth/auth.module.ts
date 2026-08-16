import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { AuthController } from './auth.controller';
import { AuthGuard, DemoAuthGuard } from './auth.guard';
import { AuthStore } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordResetDelivery } from './password-reset.delivery';

@Module({
  imports: [CoreModule],
  controllers: [AuthController],
  providers: [AuthStore, AuthService, AuthGuard, DemoAuthGuard, PasswordResetDelivery],
  exports: [AuthGuard, DemoAuthGuard, AuthService],
})
export class AuthModule {}
