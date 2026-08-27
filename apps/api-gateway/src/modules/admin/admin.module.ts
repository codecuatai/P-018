import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CoreModule } from '../core/core.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { InternalKeysController } from './internal-keys.controller';

@Module({ imports: [AuthModule, CoreModule, WorkflowModule], controllers: [AdminController, InternalKeysController], providers: [AdminGuard, AdminService] })
export class AdminModule {}
