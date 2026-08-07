import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { AgentClient, RestaurantClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { JwtGuard } from '../conversation/conversation.module';

interface AuthenticatedRequest extends CorrelatedRequest {
  user: Record<string, unknown>;
}

interface RestaurantChatBody {
  message: string;
  workflow_id?: string;
  client_turn_id?: string;
  context?: Record<string, unknown>;
}

@Controller('api/v1/restaurant-workflows')
export class RestaurantWorkflowController {
  constructor(
    private readonly agentClient: AgentClient,
    private readonly restaurantClient: RestaurantClient,
  ) {}

  @Post('chat')
  @UseGuards(JwtGuard)
  async chat(@Body() body: RestaurantChatBody, @Req() request: AuthenticatedRequest) {
    const workflowId = body.workflow_id ?? `wf-${Date.now()}`;
    const actorId = String(request.user.sub);
    const agentResult = await this.agentClient.chat({
      message: body.message,
      workflow_id: workflowId,
      client_turn_id: body.client_turn_id ?? `turn-${Date.now()}`,
      actor_id: actorId,
      context: { ...(body.context ?? {}), actor_id: actorId },
    });
    const toolRequest = agentResult.data?.tool_request ?? agentResult.tool_request;
    let toolResult: unknown = null;
    if (toolRequest) {
      toolResult = await this.restaurantClient.executeTool(
        toolRequest,
        actorId,
        String(request.correlationId ?? ''),
      );
    }
    const grounded = toolResult && typeof toolResult === 'object'
      ? await this.agentClient.chat({
        message: body.message,
        workflow_id: workflowId,
        actor_id: actorId,
        client_turn_id: `${body.client_turn_id ?? `turn-${Date.now()}`}-result`,
        context: {
          actor_id: actorId,
          slots: agentResult.data?.slots ?? agentResult.slots ?? {},
          intent: agentResult.data?.intent ?? agentResult.intent,
          tool_result: toolResult,
          tool_name: toolRequest?.tool_name,
          tool_result_only: true,
        },
      })
      : null;
    const finalResult = grounded ?? agentResult;
    return {
      data: {
        response: finalResult.data?.response ?? finalResult.response ?? '',
        workflow_id: finalResult.data?.workflow_id ?? finalResult.workflow_id,
        intent: finalResult.data?.intent ?? finalResult.intent,
        slots: finalResult.data?.slots ?? finalResult.slots ?? {},
        tool_request: toolRequest ?? null,
        tool_result: toolResult,
        status: finalResult.data?.status ?? finalResult.status ?? 'COMPLETED',
      },
      meta: { request_id: request.correlationId },
    };
  }
}
