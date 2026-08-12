import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import {
  AgentClient,
  AgentContext,
  AgentDecision,
  ConfirmationEvidence,
  RideBooking,
  RideClient,
  RideQuote,
  ServiceCallContext,
} from '../../clients/service.clients';
import { ServiceCallError } from '../../resilience/service-call-error';
import { ToolRegistry } from '../tools/tool-registry';

type WorkflowStage =
  | 'COLLECTING_DETAILS'
  | 'SERVICE_CONFIRMATION'
  | 'PAYMENT_CONFIRMATION'
  | 'COMPLETED';

type PendingRideOperation = {
  kind: 'prepare' | 'confirm';
  operationInstanceId: string;
  idempotencyKey: string;
  serializedBody: string;
  confirmationExpiresAt: string;
  bookingId: string;
  paymentReference: string | null;
};

type Workflow = {
  id: string;
  actorId: string;
  context: AgentContext;
  stage: WorkflowStage;
  quote: RideQuote | null;
  booking: RideBooking | null;
  pendingOperation: PendingRideOperation | null;
};

export type RideWorkflowHydration = {
  quoteId: string;
  bookingId?: string;
};

export type RideRouteContext = {
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
};

export type PublicWorkflow = {
  workflow_id: string;
  response: string;
  intent: string;
  stage: WorkflowStage;
  missing_fields: string[];
  quote: RideQuote | null;
  booking: RideBooking | null;
  confirmation: {
    kind: 'SERVICE_DETAILS' | 'PAYMENT';
    title: string;
    detail: string;
    action_label: string;
  } | null;
};

@Injectable()
export class RideConversationService {
  private readonly workflows = new Map<string, Workflow>();

  constructor(
    private readonly agent: AgentClient,
    private readonly ride: RideClient,
    private readonly tools: ToolRegistry,
  ) {}

  /**
   * Rebuild only the Gateway's orchestration projection from Core references.
   * Ride remains authoritative: IDs are used only to read the current quote
   * and booking, while amount/status/version always come from those reads.
   */
  async hydrateWorkflow(
    actorId: string,
    workflowId: string,
    references: RideWorkflowHydration,
    correlationId: string,
  ): Promise<void> {
    if (!workflowId || !references.quoteId) {
      throw new ConflictException('A durable Ride quote is required to resume this action.');
    }
    const existing = this.workflows.get(workflowId);
    if (existing && existing.actorId !== actorId) {
      throw new NotFoundException('Workflow not found.');
    }

    const context: ServiceCallContext = { correlationId, workflowId, toolCallId: 'hydrate_quote' };
    const quote = await this.ride.getQuote(actorId, context, references.quoteId);
    let booking = existing?.booking ?? null;
    if (references.bookingId) {
      booking = await this.ride.getBooking(
        actorId,
        { correlationId, workflowId, toolCallId: 'hydrate_booking' },
        references.bookingId,
      );
    }
    if (booking && (
      booking.quote_id !== quote.id
      || booking.quote_version !== quote.quote_version
      || booking.amount !== quote.amount
      || booking.currency !== quote.currency
    )) {
      throw new ConflictException('Durable Ride state no longer matches the authoritative quote.');
    }

    const workflow: Workflow = existing ?? {
      id: workflowId,
      actorId,
      context: emptyContext(),
      stage: 'COLLECTING_DETAILS',
      quote: null,
      booking: null,
      pendingOperation: null,
    };
    workflow.quote = quote;
    workflow.booking = booking;
    workflow.stage = hydratedStage(booking);
    workflow.pendingOperation = null;
    workflow.context.active_domain = 'ride';
    workflow.context.ride.pickup_address = quote.pickup_address;
    workflow.context.ride.dropoff_address = quote.dropoff_address;
    workflow.context.ride.vehicle_type = quote.vehicle_type;
    workflow.context.ride.latest_quote_id = quote.id;
    workflow.context.ride.latest_booking_id = booking?.id ?? null;
    workflow.context.ride.quote_version = quote.quote_version;
    workflow.context.ride.quote_amount = quote.amount;
    workflow.context.ride.quote_currency = quote.currency;
    workflow.context.ride.quote_expires_at = quote.expires_at;
    workflow.context.ride.revision = Math.max(workflow.context.ride.revision, booking ? 2 : 1);
    workflow.context.ride.pending_action = workflow.stage === 'SERVICE_CONFIRMATION'
      ? 'ride.booking.prepare'
      : workflow.stage === 'PAYMENT_CONFIRMATION'
        ? 'ride.booking.confirm'
        : null;
    this.workflows.set(workflowId, workflow);
  }

  async chat(
    actorId: string,
    message: string,
    requestedWorkflowId: string | undefined,
    correlationId: string,
    routeContext?: RideRouteContext,
  ): Promise<PublicWorkflow> {
    const workflow = this.resolveWorkflow(actorId, requestedWorkflowId);
    const decision = await this.agent.interpret(
      message,
      workflow.id,
      workflow.context,
      this.callContext(correlationId, workflow, 'agent_' + workflow.context.ride.revision),
    );
    this.applyStatePatch(workflow, decision);

    if (decision.tool_request) {
      if (decision.tool_request.workflow_id !== workflow.id) {
        throw new BadGatewayException('Agent proposed a tool for a different workflow.');
      }
      const tool = this.tools.require(decision.tool_request);
      if (tool.toolName === 'ride.quote.create') {
        const arguments_ = decision.tool_request.arguments;
        const pickupAddress = requiredString(arguments_, 'pickup_address');
        const dropoffAddress = requiredString(arguments_, 'dropoff_address');
        const vehicleType = requiredVehicle(arguments_.vehicle_type);
        const promoCode = optionalString(arguments_.promo_code);
        const quote = await this.ride.createQuote(
          actorId,
          idempotencyKey(workflow.id, 'quote', String(workflow.context.ride.revision)),
          this.callContext(correlationId, workflow, 'quote_' + workflow.context.ride.revision),
          {
            pickup_address: pickupAddress,
            dropoff_address: dropoffAddress,
            vehicle_type: vehicleType,
            ...(promoCode ? { promo_code: promoCode } : {}),
            ...validatedRouteContext(routeContext),
          },
        );
        workflow.quote = quote;
        workflow.booking = null;
        workflow.pendingOperation = null;
        workflow.stage = 'SERVICE_CONFIRMATION';
        workflow.context.ride.latest_quote_id = quote.id;
        workflow.context.ride.latest_booking_id = null;
        workflow.context.ride.quote_version = quote.quote_version;
        workflow.context.ride.quote_amount = quote.amount;
        workflow.context.ride.quote_currency = quote.currency;
        workflow.context.ride.quote_expires_at = quote.expires_at;
        workflow.context.ride.pending_action = 'ride.booking.prepare';
        workflow.context.ride.revision += 1;
        return this.view(
          workflow,
          'Mình đã nhận báo giá chính thức từ Ride. Hãy kiểm tra hành trình và giá trước khi xác nhận dịch vụ.',
          decision.intent,
          [],
        );
      }

      return this.view(
        workflow,
        'Thao tác này cần dùng nút xác nhận tương ứng để Gateway ràng buộc bằng chứng an toàn.',
        decision.intent,
        decision.missing_fields,
      );
    }

    return this.view(workflow, decision.response, decision.intent, decision.missing_fields);
  }

  async confirmService(
    actorId: string,
    workflowId: string,
    correlationId: string,
  ): Promise<PublicWorkflow> {
    const workflow = this.ownedWorkflow(actorId, workflowId);
    if (workflow.stage === 'PAYMENT_CONFIRMATION' && workflow.booking) {
      return this.view(
        workflow,
        'Thông tin chuyến đã được xác nhận. Booking đang chờ xác nhận thanh toán sandbox.',
        'prepare_ride_booking',
        [],
      );
    }
    if (workflow.stage !== 'SERVICE_CONFIRMATION' || !workflow.quote) {
      throw new ConflictException('Workflow is not awaiting service confirmation.');
    }
    if (new Date(workflow.quote.expires_at).getTime() <= Date.now()) {
      throw new ConflictException('Quote has expired. Request a new quote.');
    }

    const pending = this.prepareSnapshot(workflow, actorId);
    this.assertSnapshotUsable(workflow, pending);
    try {
      const booking = await this.ride.prepareBooking(
        actorId,
        pending.idempotencyKey,
        this.callContext(correlationId, workflow, pending.operationInstanceId),
        pending.serializedBody,
      );
      workflow.booking = booking;
      workflow.pendingOperation = null;
      workflow.stage = 'PAYMENT_CONFIRMATION';
      workflow.context.ride.latest_booking_id = booking.id;
      workflow.context.ride.pending_action = 'ride.booking.confirm';
      workflow.context.ride.revision += 1;
      return this.view(
        workflow,
        'Thông tin chuyến đã được xác nhận. Booking đã tạo nhưng chưa hoàn tất; hãy xác nhận thanh toán sandbox riêng biệt.',
        'prepare_ride_booking',
        [],
      );
    } catch (error) {
      throw ambiguousOutcome(error);
    }
  }

  async confirmPayment(
    actorId: string,
    workflowId: string,
    correlationId: string,
  ): Promise<PublicWorkflow> {
    const workflow = this.ownedWorkflow(actorId, workflowId);
    if (workflow.stage === 'COMPLETED' && workflow.booking) {
      return this.view(
        workflow,
        `Booking đã được ghi nhận. Trạng thái chuyến hiện tại: ${workflow.booking.status}.`,
        'ride_booking_confirmed',
        [],
      );
    }
    if (workflow.stage !== 'PAYMENT_CONFIRMATION' || !workflow.booking || !workflow.quote) {
      throw new ConflictException('Workflow is not awaiting payment confirmation.');
    }

    const pending = this.confirmSnapshot(workflow, actorId);
    this.assertSnapshotUsable(workflow, pending);
    try {
      workflow.booking = await this.ride.confirmBooking(
        actorId,
        pending.idempotencyKey,
        this.callContext(correlationId, workflow, pending.operationInstanceId),
        pending.bookingId,
        pending.serializedBody,
      );
    } catch (error) {
      if (isAmbiguous(error)) {
        const reconciled = await this.reconcileConfirmation(
          workflow,
          actorId,
          correlationId,
          pending,
        );
        if (!reconciled) {
          throw ambiguousOutcome(error);
        }
        workflow.booking = reconciled;
      } else {
        throw error;
      }
    }

    workflow.pendingOperation = null;
    workflow.stage = 'COMPLETED';
    workflow.context.ride.pending_action = null;
    workflow.context.ride.revision += 1;
    return this.view(
      workflow,
      `Thanh toán sandbox đã được xác nhận. Booking đã chuyển sang trạng thái ${workflow.booking.status}; chuyến sẽ tiếp tục được theo dõi theo trạng thái Ride authoritative.`,
      'ride_booking_confirmed',
      [],
    );
  }

  private prepareSnapshot(workflow: Workflow, actorId: string): PendingRideOperation {
    if (workflow.pendingOperation) {
      if (workflow.pendingOperation.kind !== 'prepare') {
        throw new ConflictException('A different workflow operation is pending.');
      }
      return workflow.pendingOperation;
    }
    const quote = workflow.quote;
    if (!quote) {
      throw new ConflictException('Workflow has no quote.');
    }
    const confirmation = evidence(
      actorId,
      {
        action: 'ride.booking.prepare',
        actor_id: actorId,
        quote_id: quote.id,
        quote_version: quote.quote_version,
        amount: quote.amount,
        currency: quote.currency,
      },
      quote,
    );
    const snapshot: PendingRideOperation = {
      kind: 'prepare',
      operationInstanceId: 'tool_' + randomUUID(),
      idempotencyKey: idempotencyKey(workflow.id, 'prepare', quote.id),
      serializedBody: JSON.stringify({ quote_id: quote.id, confirmation }),
      confirmationExpiresAt: confirmation.expires_at,
      bookingId: '',
      paymentReference: null,
    };
    workflow.pendingOperation = snapshot;
    return snapshot;
  }

  private confirmSnapshot(workflow: Workflow, actorId: string): PendingRideOperation {
    if (workflow.pendingOperation) {
      if (workflow.pendingOperation.kind !== 'confirm') {
        throw new ConflictException('A different workflow operation is pending.');
      }
      return workflow.pendingOperation;
    }
    const booking = workflow.booking;
    const quote = workflow.quote;
    if (!booking || !quote) {
      throw new ConflictException('Workflow is missing booking details.');
    }
    const paymentReference = 'pay_sandbox_' + digest(workflow.id + '|' + booking.id).slice(0, 24);
    const confirmation = evidence(
      actorId,
      {
        action: 'ride.booking.confirm',
        actor_id: actorId,
        booking_id: booking.id,
        quote_id: booking.quote_id,
        quote_version: booking.quote_version,
        amount: booking.amount,
        currency: booking.currency,
        payment_reference: paymentReference,
      },
      quote,
    );
    const snapshot: PendingRideOperation = {
      kind: 'confirm',
      operationInstanceId: 'tool_' + randomUUID(),
      idempotencyKey: idempotencyKey(workflow.id, 'confirm', booking.id),
      serializedBody: JSON.stringify({ payment_reference: paymentReference, confirmation }),
      confirmationExpiresAt: confirmation.expires_at,
      bookingId: booking.id,
      paymentReference,
    };
    workflow.pendingOperation = snapshot;
    return snapshot;
  }

  private async reconcileConfirmation(
    workflow: Workflow,
    actorId: string,
    correlationId: string,
    pending: PendingRideOperation,
  ): Promise<RideBooking | null> {
    try {
      const booking = await this.ride.getBooking(
        actorId,
        this.callContext(correlationId, workflow, pending.operationInstanceId + '_reconcile'),
        pending.bookingId,
      );
      if (
        isRideAfterPayment(booking.status)
        && booking.quote_id === workflow.quote?.id
        && booking.quote_version === workflow.quote?.quote_version
        && booking.amount === workflow.quote?.amount
        && booking.currency === workflow.quote?.currency
        && booking.payment_reference === pending.paymentReference
      ) {
        return booking;
      }
    } catch {
      // The original outcome stays ambiguous; do not hide it behind a reconciliation error.
    }
    return null;
  }

  private assertSnapshotUsable(workflow: Workflow, pending: PendingRideOperation): void {
    if (new Date(pending.confirmationExpiresAt).getTime() > Date.now()) {
      return;
    }
    workflow.pendingOperation = null;
    throw new ConflictException('Confirmation has expired. Confirm the current details again.');
  }

  private callContext(
    correlationId: string,
    workflow: Workflow,
    toolCallId: string,
  ): ServiceCallContext {
    return { correlationId, workflowId: workflow.id, toolCallId };
  }

  private resolveWorkflow(actorId: string, requestedId: string | undefined): Workflow {
    if (requestedId) {
      const existing = this.workflows.get(requestedId);
      if (existing) return this.ownedWorkflow(actorId, requestedId);
      // Unified Assistant workflows are allocated by the Gateway task store.
      // They are still actor-owned, but the first quote call must be allowed to
      // materialize the generated gateway identifier.
      if (!requestedId.startsWith('gw_')) return this.ownedWorkflow(actorId, requestedId);
      const workflow: Workflow = {
        id: requestedId,
        actorId,
        stage: 'COLLECTING_DETAILS',
        quote: null,
        booking: null,
        pendingOperation: null,
        context: emptyContext(),
      };
      this.workflows.set(workflow.id, workflow);
      return workflow;
    }
    const workflow: Workflow = {
      id: 'wf_' + randomUUID(),
      actorId,
      stage: 'COLLECTING_DETAILS',
      quote: null,
      booking: null,
      pendingOperation: null,
      context: emptyContext(),
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  private ownedWorkflow(actorId: string, workflowId: string): Workflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.actorId !== actorId) {
      throw new NotFoundException('Workflow not found.');
    }
    return workflow;
  }

  private applyStatePatch(workflow: Workflow, decision: AgentDecision): void {
    workflow.context.active_domain = decision.state_patch.active_domain;
    for (const field of decision.state_patch.clear_fields) {
      clearRideField(workflow.context, field);
    }
    for (const update of decision.state_patch.slot_updates) {
      setRideField(workflow.context, update.slot, update.value);
    }
    workflow.context.ride.revision = decision.state_patch.revision;
    workflow.context.ride.pending_action = decision.state_patch.pending_action;
  }

  private view(
    workflow: Workflow,
    response: string,
    intent: string,
    missingFields: string[],
  ): PublicWorkflow {
    return {
      workflow_id: workflow.id,
      response,
      intent,
      stage: workflow.stage,
      missing_fields: missingFields,
      quote: workflow.quote,
      booking: workflow.booking,
      confirmation: confirmationView(workflow),
    };
  }
}

function ambiguousOutcome(error: unknown): unknown {
  return isAmbiguous(error) ? error.withOutcome('AMBIGUOUS', 'OUTCOME_UNKNOWN') : error;
}

function hydratedStage(booking: RideBooking | null): WorkflowStage {
  if (!booking) return 'SERVICE_CONFIRMATION';
  if (booking.status === 'AWAITING_CONFIRMATION' || booking.status === 'AWAITING_PAYMENT_CONFIRMATION') return 'PAYMENT_CONFIRMATION';
  if (isRideAfterPayment(booking.status)) return 'COMPLETED';
  throw new ConflictException('The durable Ride booking is no longer actionable.');
}

function isRideAfterPayment(status: RideBooking['status']): boolean {
  return [
    'SEARCHING_DRIVER',
    'DRIVER_ASSIGNED',
    'DRIVER_TO_PICKUP',
    'DRIVER_ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_DRIVER',
    'FAILED',
    'PAYMENT_FAILED',
    'CANCELLED',
  ].includes(status);
}

function isAmbiguous(error: unknown): error is ServiceCallError {
  return error instanceof ServiceCallError && error.outcome === 'AMBIGUOUS';
}

function emptyContext(): AgentContext {
  return {
    active_domain: null,
    ride: {
      pickup_address: null,
      dropoff_address: null,
      vehicle_type: 'CAR_4',
      promo_code: null,
      latest_quote_id: null,
      latest_booking_id: null,
      quote_version: null,
      quote_amount: null,
      quote_currency: null,
      quote_expires_at: null,
      revision: 0,
      pending_action: null,
    },
  };
}

function setRideField(context: AgentContext, field: string, value: string): void {
  switch (field) {
    case 'pickup_address':
      context.ride.pickup_address = value;
      break;
    case 'dropoff_address':
      context.ride.dropoff_address = value;
      break;
    case 'vehicle_type':
      context.ride.vehicle_type = requiredVehicle(value);
      break;
    case 'promo_code':
      context.ride.promo_code = value;
      break;
    case 'latest_quote_id':
      context.ride.latest_quote_id = value;
      break;
    case 'latest_booking_id':
      context.ride.latest_booking_id = value;
      break;
    default:
      throw new BadGatewayException('Agent proposed an unsupported state field.');
  }
}

function clearRideField(context: AgentContext, field: string): void {
  switch (field) {
    case 'latest_quote_id':
      context.ride.latest_quote_id = null;
      break;
    case 'latest_booking_id':
      context.ride.latest_booking_id = null;
      break;
    case 'quote_version':
      context.ride.quote_version = null;
      break;
    case 'quote_amount':
      context.ride.quote_amount = null;
      break;
    case 'quote_currency':
      context.ride.quote_currency = null;
      break;
    case 'quote_expires_at':
      context.ride.quote_expires_at = null;
      break;
    default:
      throw new BadGatewayException('Agent proposed an unsupported clear field.');
  }
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== 'string' || item.length === 0) {
    throw new BadGatewayException('Agent tool arguments are invalid.');
  }
  return item;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredVehicle(value: unknown): 'BIKE' | 'CAR_4' | 'CAR_7' {
  if (value === 'BIKE' || value === 'CAR_4' || value === 'CAR_7') {
    return value;
  }
  throw new BadGatewayException('Agent proposed an invalid vehicle type.');
}

function validatedRouteContext(value: RideRouteContext | undefined): RideRouteContext {
  if (!value) return {};
  const result: RideRouteContext = {};
  for (const [key, coordinate] of Object.entries(value) as Array<[keyof RideRouteContext, number | undefined]>) {
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) continue;
    const latitude = key.endsWith('latitude');
    if (latitude && coordinate >= -90 && coordinate <= 90) result[key] = coordinate;
    if (!latitude && coordinate >= -180 && coordinate <= 180) result[key] = coordinate;
  }
  return result;
}

function evidence(
  actorId: string,
  payload: Record<string, unknown>,
  quote: RideQuote,
): ConfirmationEvidence {
  const now = Date.now();
  const payloadHash = digest(canonicalJson(payload));
  return {
    confirmation_id: 'confirmation_' + randomUUID(),
    actor_id: actorId,
    action: String(payload.action),
    payload_hash: payloadHash,
    quote_version: quote.quote_version,
    amount: quote.amount,
    currency: quote.currency,
    issued_at: new Date(now - 1_000).toISOString(),
    expires_at: new Date(now + 5 * 60_000).toISOString(),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function idempotencyKey(workflowId: string, operation: string, material: string): string {
  return 'gw_' + operation + '_' + digest(workflowId + '|' + material).slice(0, 32);
}

function confirmationView(workflow: Workflow): PublicWorkflow['confirmation'] {
  if (workflow.stage === 'SERVICE_CONFIRMATION' && workflow.quote) {
    return {
      kind: 'SERVICE_DETAILS',
      title: 'Xác nhận thông tin chuyến xe',
      detail: 'Xác nhận điểm đón, điểm đến, loại xe và báo giá. Chưa thực hiện thanh toán.',
      action_label: 'Xác nhận chuyến xe',
    };
  }
  if (workflow.stage === 'PAYMENT_CONFIRMATION' && workflow.booking) {
    return {
      kind: 'PAYMENT',
      title: 'Xác nhận thanh toán sandbox',
      detail: 'Xác nhận riêng giá và booking trước khi Ride gán tài xế.',
      action_label: 'Xác nhận thanh toán',
    };
  }
  return null;
}
