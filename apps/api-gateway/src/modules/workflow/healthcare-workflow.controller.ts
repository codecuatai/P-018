import { BadRequestException, Body, ConflictException, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';

import { AgentClient, HealthcareClient, HealthcareTool, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from '../confirmation/confirmation.service';

interface AuthenticatedRequest extends CorrelatedRequest {
  user: AuthUser;
}

interface HealthcareChatBody {
  message: string;
  workflow_id?: string;
  client_turn_id?: string;
  patient_id?: number;
  symptoms?: string;
  context?: Record<string, unknown>;
}

interface HealthcarePaymentBody {
  appointment_id: number;
  workflow_id?: string;
}

interface HealthcareConfirmationBody {
  confirmation_id: string;
  workflow_id?: string;
}

type AgentResult = JsonObject & {
  data?: JsonObject;
  response?: string;
  workflow_id?: string;
  intent?: string;
  slots?: Record<string, unknown>;
  tool_request?: HealthcareTool;
  status?: string;
};

function resultData(result: AgentResult): JsonObject {
  return result.data ?? result;
}

function toolFrom(result: AgentResult): HealthcareTool | undefined {
  return result.data?.tool_request as HealthcareTool | undefined ?? result.tool_request;
}

function slotsFrom(result: AgentResult): Record<string, unknown> {
  return resultData(result).slots && typeof resultData(result).slots === 'object'
    ? resultData(result).slots as Record<string, unknown>
    : {};
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function healthcareFinalStateError(appointment: JsonObject): { code: string; detail: string } | null {
  if (appointment.status === 'EXPIRED') return { code: 'APPOINTMENT_EXPIRED', detail: 'The appointment hold has expired.' };
  if (appointment.status === 'CANCELLED') return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'The appointment has been cancelled.' };
  if (appointment.status === 'CONFIRMED') return { code: 'APPOINTMENT_ALREADY_CONFIRMED', detail: 'The appointment is already confirmed.' };
  if (appointment.is_paid !== true) return { code: 'PAYMENT_REQUIRED', detail: 'Appointment payment is required before confirmation.' };
  if (appointment.status !== 'DRAFT') return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'Only a draft appointment can be confirmed.' };
  const slot = isRecord(appointment.slot) ? appointment.slot : null;
  const expiresAt = slot && typeof slot.hold_expires_at === 'string' ? Date.parse(slot.hold_expires_at) : Number.NaN;
  if (!slot || slot.status !== 'HOLDING' || !Number.isFinite(expiresAt)) {
    return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'The appointment does not have an active slot hold.' };
  }
  if (expiresAt <= Date.now()) return { code: 'APPOINTMENT_EXPIRED', detail: 'The appointment hold has expired.' };
  return null;
}

function structuredData(toolName: string | undefined, result: unknown, slots: Record<string, unknown>): JsonObject {
  const data: JsonObject = { slots };
  if (Array.isArray(result) && toolName === 'healthcare.list_slots') {
    data.doctors = result;
    data.candidates = result.flatMap((doctor) => {
      if (!doctor || typeof doctor !== 'object') return [];
      const value = doctor as JsonObject;
      const availableSlots = Array.isArray(value.available_slots) ? value.available_slots : [];
      return availableSlots.map((slot) => ({
        doctor_id: value.id,
        doctor_name: value.name,
        department: value.department,
        description: value.description,
        price: value.price,
        slot,
      }));
    });
  } else if (Array.isArray(result) && toolName === 'healthcare.list_departments') {
    data.departments = result;
  } else if (result && typeof result === 'object') {
    const value = result as JsonObject;
    if (value.appointment_id !== undefined) {
      data.appointment = value;
      if (value.doctor) data.doctor = value.doctor;
      if (value.slot) data.slot = value.slot;
      if (value.price !== undefined) data.price = value.price;
      if (value.is_paid !== undefined) data.payment = { status: value.is_paid === true ? 'SUCCEEDED' : 'REQUIRED' };
    }
  }
  return data;
}

@Controller('api/v1/healthcare-workflows')
export class HealthcareWorkflowController {
  constructor(
    private readonly agentClient: AgentClient,
    private readonly healthcareClient: HealthcareClient,
    private readonly confirmations: ConfirmationService,
  ) {}

  @Post('chat')
  @UseGuards(DemoAuthGuard)
  async chat(@Body() body: HealthcareChatBody, @Req() request: AuthenticatedRequest) {
    const workflowId = body.workflow_id ?? `wf-${Date.now()}`;
    const actorId = String(request.user.sub);
    const correlationId = String(request.correlationId ?? 'cor_unknown');
    const context = {
      ...(body.context ?? {}),
      actor_id: actorId,
      patient_id: body.patient_id ?? this.healthcareClient.defaultPatientId,
      ...(body.symptoms ? { symptoms: body.symptoms } : {}),
    };

    let current = await this.agentClient.healthcareChat({
      message: body.message,
      workflow_id: workflowId,
      client_turn_id: body.client_turn_id ?? `turn-${Date.now()}`,
      actor_id: actorId,
      context,
    }, correlationId) as AgentResult;
    let toolResult: unknown = null;
    let toolName: string | undefined;
    let toolRequest: HealthcareTool | undefined;

    // A symptom lookup may lead to a department lookup and then a doctor/slot lookup.
    // Keep the loop bounded; the Agent still only emits typed proposals.
    for (let step = 0; step < 4; step += 1) {
      const nextToolRequest = toolFrom(current);
      if (!nextToolRequest) break;
      toolRequest = nextToolRequest;
      toolName = nextToolRequest.tool_name;

      if (toolRequest.risk_level === 'FINANCIAL_OR_FINAL') {
        const appointmentId = Number(toolRequest.arguments.appointment_id);
        if (!Number.isInteger(appointmentId) || appointmentId < 1) {
          throw new BadRequestException({ code: 'PAYLOAD_MISMATCH', detail: 'A valid appointment is required before final confirmation.' });
        }
        const appointment = await this.healthcareClient.getAppointment(appointmentId, actorId, correlationId);
        const finalStateError = healthcareFinalStateError(appointment);
        if (finalStateError?.code === 'PAYMENT_REQUIRED') {
          const structured = structuredData('healthcare.appointment.get', appointment, slotsFrom(current));
          return {
            data: {
              response: 'Lịch hẹn đang được giữ nhưng chưa có xác nhận thanh toán. Bạn thanh toán trước rồi xác nhận lần cuối nhé.',
              workflow_id: workflowId,
              intent: resultData(current).intent,
              slots: resultData(current).slots ?? {},
              tool_request: toolRequest,
              tool_result: appointment,
              ...structured,
              payment_required: true,
              status: 'PAYMENT_REQUIRED',
            },
            meta: { request_id: request.correlationId },
          };
        }
        if (finalStateError) throw new ConflictException(finalStateError);
        const pending = await this.confirmations.prepareDomainConfirmation(request.user, toolRequest, appointment, correlationId);
        const structured = structuredData('healthcare.appointment.get', appointment, slotsFrom(current));
        return {
          data: {
            response: 'Thanh toán đã được ghi nhận. Bạn xác nhận lần cuối để hoàn tất lịch khám nhé.',
            workflow_id: workflowId,
            intent: resultData(current).intent,
            slots: resultData(current).slots ?? {},
            tool_request: toolRequest,
            tool_result: appointment,
            ...structured,
            pending_confirmation: pending,
            payment: { status: 'SUCCEEDED', appointment_id: appointmentId },
            status: 'CONFIRMATION_REQUIRED',
          },
          meta: { request_id: request.correlationId },
        };
      }

      const dispatchTool = toolRequest.tool_name === 'healthcare.hold_slot' && toolRequest.arguments.patient_id === undefined
        ? { ...toolRequest, arguments: { ...toolRequest.arguments, patient_id: context.patient_id } }
        : toolRequest;
      toolResult = await this.healthcareClient.executeTool(dispatchTool, actorId, correlationId);
      const grounded = await this.agentClient.healthcareChat({
        message: body.message,
        workflow_id: workflowId,
        actor_id: actorId,
        client_turn_id: `${body.client_turn_id ?? `turn-${Date.now()}`}-result-${step}`,
        context: {
          ...context,
          slots: slotsFrom(current),
          intent: resultData(current).intent,
          tool_result: toolResult,
          tool_name: dispatchTool.tool_name,
          tool_result_only: true,
        },
      }, correlationId) as AgentResult;
      current = grounded;
    }

    const finalData = resultData(current);
    const structured = structuredData(toolName, toolResult, slotsFrom(current));
    return {
      data: {
        response: finalData.response ?? current.response ?? '',
        workflow_id: finalData.workflow_id ?? current.workflow_id ?? workflowId,
        intent: finalData.intent ?? current.intent,
        slots: finalData.slots ?? current.slots ?? {},
        tool_request: toolFrom(current) ?? toolRequest ?? null,
        tool_result: toolResult,
        ...structured,
        status: finalData.status ?? current.status ?? 'COMPLETED',
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Post('payment')
  @UseGuards(DemoAuthGuard)
  async payment(
    @Body() body: HealthcarePaymentBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!Number.isInteger(Number(body.appointment_id)) || Number(body.appointment_id) < 1) {
      throw new BadRequestException({ code: 'INVALID_APPOINTMENT', detail: 'appointment_id must be a positive integer.' });
    }
    const correlationId = request.correlationId ?? 'cor_unknown';
    const key = idempotencyKey ?? `healthcare-payment:${body.workflow_id ?? 'default'}:${body.appointment_id}`;
    const payment = await this.healthcareClient.acknowledgePayment(Number(body.appointment_id), request.user.sub, correlationId, key);
    const appointment = await this.healthcareClient.getAppointment(Number(body.appointment_id), request.user.sub, correlationId);
    const finalStateError = healthcareFinalStateError(appointment);
    if (finalStateError) {
      throw new ConflictException(finalStateError);
    }
    return {
      data: {
        workflow_id: body.workflow_id,
      payment,
      appointment,
      ...structuredData('healthcare.appointment.get', appointment, {}),
      status: 'PAYMENT_SUCCEEDED',
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Post('confirm')
  @UseGuards(DemoAuthGuard)
  async confirm(
    @Body() body: HealthcareConfirmationBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body.confirmation_id) throw new BadRequestException({ code: 'INVALID_CONFIRMATION', detail: 'confirmation_id is required.' });
    const result = await this.confirmations.executeDomain(
      body.confirmation_id,
      request.user,
      body.workflow_id ? { workflow_id: body.workflow_id } : {},
      request.correlationId ?? 'cor_unknown',
      idempotencyKey ?? `healthcare:${body.confirmation_id}`,
      'CONFIRM_HEALTHCARE_APPOINTMENT',
      body.workflow_id,
    );
    return { data: result, meta: { request_id: request.correlationId } };
  }
}
