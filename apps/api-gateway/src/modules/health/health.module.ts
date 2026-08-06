import { Controller, Get, Module, Req, ServiceUnavailableException } from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowService } from '../workflow/workflow.module';

@Controller('health')
class HealthController {
  constructor(private readonly workflow: WorkflowService) {}
  @Get('live')
  live(@Req() request: CorrelatedRequest): object {
    return { data: { status: 'live' }, meta: { request_id: request.correlationId } };
  }

  @Get('ready')
  async ready(@Req() request: CorrelatedRequest): Promise<object> {
    const database = await this.workflow.checkReadiness();
    const healthy = database && this.workflow.isWorkerHealthy();
    if (!healthy) throw new ServiceUnavailableException({ code: 'NOT_READY', detail: 'Gateway dependencies or recovery workers are not ready.' });
    return { data: { status: 'ready', service: 'api-gateway', database: 'connected', workflow_worker: 'healthy', confirmation_recovery_worker: 'healthy' }, meta: { request_id: request.correlationId } };
  }
}

@Module({ imports: [WorkflowModule], controllers: [HealthController] })
export class HealthModule {}
