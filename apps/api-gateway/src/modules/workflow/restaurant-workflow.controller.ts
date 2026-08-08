import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';

import { AgentClient, JsonObject, RestaurantClient, RestaurantTool } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from '../confirmation/confirmation.service';

interface AuthenticatedRequest extends CorrelatedRequest {
  user: AuthUser;
}

type AgentResult = JsonObject & {
  data?: JsonObject;
  response?: string;
  workflow_id?: string;
  intent?: string;
  slots?: Record<string, unknown>;
  tool_request?: RestaurantTool;
  status?: string;
};

interface RestaurantChatBody {
  message: string;
  workflow_id?: string;
  client_turn_id?: string;
  context?: Record<string, unknown>;
}

interface RestaurantConfirmationBody {
  confirmation_id: string;
  workflow_id?: string;
}

@Controller('api/v1/restaurant-workflows')
export class RestaurantWorkflowController {
  constructor(
    private readonly agentClient: AgentClient,
    private readonly restaurantClient: RestaurantClient,
    private readonly confirmations: ConfirmationService,
  ) {}

  @Post('chat')
  @UseGuards(DemoAuthGuard)
  async chat(@Body() body: RestaurantChatBody, @Req() request: AuthenticatedRequest) {
    const workflowId = body.workflow_id ?? `wf-${Date.now()}`;
    const actorId = String(request.user.sub);
    const correlationId = String(request.correlationId ?? 'cor_unknown');
    const agentResult = await this.agentClient.restaurantChat({
      message: body.message,
      workflow_id: workflowId,
      client_turn_id: body.client_turn_id ?? `turn-${Date.now()}`,
      actor_id: actorId,
      context: { ...(body.context ?? {}), actor_id: actorId },
    }, correlationId) as AgentResult;
    const toolRequest = agentResult.data?.tool_request as RestaurantTool | undefined ?? agentResult.tool_request;
    const requiresFinalConfirmation = toolRequest?.risk_level === 'FINANCIAL_OR_FINAL';
    if (toolRequest && requiresFinalConfirmation) {
      const pending = await this.confirmations.prepareDomainConfirmation(request.user, toolRequest, undefined, correlationId);
      return {
        data: {
          response: 'Thông tin đặt bàn đã sẵn sàng. Bạn xác nhận lần cuối để tạo đặt bàn nhé.',
          workflow_id: workflowId,
          intent: agentResult.data?.intent ?? agentResult.intent,
          slots: agentResult.data?.slots ?? agentResult.slots ?? {},
          tool_request: toolRequest,
          tool_result: null,
          status: 'CONFIRMATION_REQUIRED',
          pending_confirmation: pending,
        },
        meta: { request_id: request.correlationId },
      };
    }
    let toolResult: unknown = null;
    if (toolRequest) {
      toolResult = await this.restaurantClient.executeTool(
        toolRequest,
        actorId,
        correlationId,
      );
    }
    const grounded = !requiresFinalConfirmation && toolResult && typeof toolResult === 'object'
      ? await this.agentClient.restaurantChat({
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
      }, correlationId) as AgentResult
      : null;
    const finalResult = grounded ?? agentResult;
    const finalData = finalResult.data ?? finalResult;
    return {
      data: {
        response: finalData.response ?? finalResult.response ?? '',
        workflow_id: finalData.workflow_id ?? finalResult.workflow_id,
        intent: finalData.intent ?? finalResult.intent,
        slots: finalData.slots ?? finalResult.slots ?? {},
        tool_request: toolRequest ?? null,
        tool_result: toolResult,
        status: requiresFinalConfirmation ? 'CONFIRMATION_REQUIRED' : finalData.status ?? finalResult.status ?? 'COMPLETED',
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Post('confirm')
  @UseGuards(DemoAuthGuard)
  async confirm(
    @Body() body: RestaurantConfirmationBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body.confirmation_id) throw new BadRequestException({ code: 'INVALID_CONFIRMATION', detail: 'confirmation_id is required.' });
    const result = await this.confirmations.executeDomain(
      body.confirmation_id,
      request.user,
      body.workflow_id ? { workflow_id: body.workflow_id } : {},
      request.correlationId ?? 'cor_unknown',
      idempotencyKey ?? `restaurant:${body.confirmation_id}`,
      'CREATE_RESTAURANT_RESERVATION',
      body.workflow_id,
    );
    return { data: result, meta: { request_id: request.correlationId } };
  }
}
