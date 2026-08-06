import { Controller, Get, Module, Req } from '@nestjs/common';

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
  ready(@Req() request: CorrelatedRequest): object {
    const healthy = this.workflow.isWorkerHealthy();
    return { data: { status: healthy ? 'ready' : 'not_ready', service: 'api-gateway', workflow_worker: healthy ? 'healthy' : 'unhealthy' }, meta: { request_id: request.correlationId } };
  }
}

@Module({ imports: [WorkflowModule], controllers: [HealthController] })
export class HealthModule {}
