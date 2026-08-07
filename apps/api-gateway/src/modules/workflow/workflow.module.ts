import { Module } from '@nestjs/common';
import { AgentClient, RestaurantClient } from '../../clients/service.clients';
import { RestaurantWorkflowController } from './restaurant-workflow.controller';

@Module({
  controllers: [RestaurantWorkflowController],
  providers: [AgentClient, RestaurantClient],
})
export class WorkflowModule {}
