import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { DemoAuthGuard } from './auth.guard';

@Module({ controllers: [AuthController], providers: [DemoAuthGuard], exports: [DemoAuthGuard] })
export class AuthModule {}
