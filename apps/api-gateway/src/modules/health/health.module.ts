import { Controller, Get, Module, Req } from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';

@Controller('health')
class HealthController {
  @Get('live')
  live(@Req() request: CorrelatedRequest): object {
    return { data: { status: 'live' }, meta: { request_id: request.correlationId } };
  }

  @Get('ready')
  ready(@Req() request: CorrelatedRequest): object {
    return { data: { status: 'ready', service: 'api-gateway' }, meta: { request_id: request.correlationId } };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
