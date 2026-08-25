import { createHash, randomUUID } from 'crypto';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BadRequestException,
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { ClientsModule } from '../../clients/clients.module';
import { HealthcareClient, RestaurantClient } from '../../clients/service.clients';
import { RideClient } from '../../clients/service.clients';
import { LocationService } from '../personal/personal.module';
import { CoreModule, CoreStore, MultiServiceWorkflowRecord } from '../core/core.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { AuthUser } from '../auth/auth.types';
import { PersonalModule } from '../personal/personal.module';
import {
  AuthoritativeResource,
  Candidate,
  MultiServiceKind,
  MultiServicePlan,
  StepResult,
  authoritativeDestination,
  buildMultiServicePlan,
  rankCandidates,
  recordCompensationResult,
  recordStepResult,
} from './multi-service-reliability';

class AuthoritativeResourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  id!: string;

  @IsIn(['restaurant-service', 'healthcare-service'])
  authority!: AuthoritativeResource['authority'];
}

class MultiServicePlanDto {
  @IsIn(['restaurant_ride', 'healthcare_ride', 'food_healthcare'])
  kind!: MultiServiceKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  workflow_id?: string;

  @ValidateNested()
  @Type(() => AuthoritativeResourceDto)
  source!: AuthoritativeResourceDto;
}

class StepResultDto {
  @IsIn(['SUCCEEDED', 'FAILED'])
  status!: StepResult['status'];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payload_hash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  error_code?: string;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}

class RideActivationDto {
  @IsString()
  @MinLength(3)
  pickup_address!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickup_latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickup_longitude?: number;

  @IsOptional()
  @IsIn(['BIKE', 'CAR_4', 'CAR_7'])
  vehicle_type?: 'BIKE' | 'CAR_4' | 'CAR_7';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  passenger_count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pickup_time?: string;
}

class OriginDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class RankCandidatesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  candidates!: Array<Record<string, unknown>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => OriginDto)
  origin?: OriginDto;
}

interface AuthenticatedRequest extends CorrelatedRequest {
  user: AuthUser;
}

@Injectable()
export class MultiServiceReliabilityService {
  constructor(
    private readonly core: CoreStore,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
    private readonly ride: RideClient,
    private readonly locations: LocationService,
  ) {}

  async createPlan(actorId: string, idempotencyKey: string, body: MultiServicePlanDto, correlationId: string): Promise<MultiServicePlan> {
    const requestedWorkflowId = body.workflow_id?.trim();
    const workflowId = requestedWorkflowId ?? `msw_${randomUUID()}`;
    const requestedSource = normalizeSource(body.source);
    const source = await this.resolveSource(body.kind, requestedSource, actorId, correlationId);
    const requestHash = hashRequest({ kind: body.kind, source: { id: source.id, authority: source.authority }, workflow_id: requestedWorkflowId ?? null });
    const now = new Date().toISOString();
    const plan = buildMultiServicePlan(workflowId, actorId, body.kind, source, now);
    const saved = await this.save({ workflowId, actorId, idempotencyKey, requestHash, kind: body.kind, status: plan.status, plan: plan as unknown as Record<string, unknown>, createdAt: now, updatedAt: now });
    if (saved.workflowId === workflowId) {
      await this.core.audit({ action: 'MULTI_SERVICE_WORKFLOW_PLANNED', actorId, correlationId, resourceId: workflowId, metadata: { kind: body.kind, destination: authoritativeDestination(source) } });
    }
    return saved.plan as unknown as MultiServicePlan;
  }

  private async resolveSource(kind: MultiServiceKind, requested: AuthoritativeResource, actorId: string, correlationId: string): Promise<AuthoritativeResource> {
    const expectedAuthority: AuthoritativeResource['authority'] = kind === 'restaurant_ride' ? 'restaurant-service' : 'healthcare-service';
    if (requested.authority !== expectedAuthority) {
      throw new BadRequestException({ code: 'AUTHORITATIVE_SOURCE_MISMATCH', detail: 'The selected resource does not belong to the workflow source domain.', retryable: false });
    }

    const domainResource = expectedAuthority === 'restaurant-service'
      ? await this.restaurant.getRestaurant(requested.id, actorId, correlationId)
      : await this.healthcare.getFacility(requested.id, actorId, correlationId);
    const resolvedId = expectedAuthority === 'restaurant-service' ? optionalString(domainResource.id) : optionalString(domainResource.source_id);
    if (resolvedId !== requested.id) {
      throw new BadGatewayException({ code: 'AUTHORITATIVE_RESOURCE_INVALID', detail: 'The owning service returned a different resource identity.', retryable: true });
    }

    const latitude = boundedNumber(domainResource.latitude, -90, 90);
    const longitude = boundedNumber(domainResource.longitude, -180, 180);
    const address = optionalString(domainResource.address) ?? optionalString(domainResource.location);
    const coordinateStatus = optionalString(domainResource.coordinate_status);
    return {
      id: resolvedId,
      authority: expectedAuthority,
      ...(address ? { address } : {}),
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
      ...(coordinateStatus ? { coordinate_status: coordinateStatus } : {}),
    };
  }

  async getPlan(actorId: string, workflowId: string): Promise<MultiServicePlan> {
    const record = await this.core.getMultiServiceWorkflow(workflowId, actorId);
    if (!record) throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', detail: 'Không tìm thấy workflow đa dịch vụ.', retryable: false });
    return record.plan as unknown as MultiServicePlan;
  }

  async applyStep(actorId: string, workflowId: string, stepId: string, idempotencyKey: string, body: StepResultDto, correlationId: string): Promise<MultiServicePlan> {
    const record = await this.requireRecord(actorId, workflowId);
    const next = this.applyStepResult(record, stepId, { status: body.status, idempotency_key: idempotencyKey, payload_hash: body.payload_hash, error_code: body.error_code, result: body.result }, correlationId);
    return next;
  }

  async activateRideStep(actorId: string, workflowId: string, stepId: string, idempotencyKey: string, body: RideActivationDto, correlationId: string): Promise<MultiServicePlan> {
    const record = await this.requireRecord(actorId, workflowId);
    const plan = record.plan as unknown as MultiServicePlan;
    const activationHash = hashRequest({ workflow_id: workflowId, step_id: stepId, ...body });
    const priorHash = plan.applied_idempotency[idempotencyKey];
    if (priorHash) {
      if (priorHash !== activationHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', detail: 'Idempotency-Key đã được dùng với payload khác.', retryable: false });
      return plan;
    }
    const step = plan.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.domain !== 'ride' || step.action !== 'ride.quote.create') {
      throw new BadRequestException({ code: 'RIDE_STEP_REQUIRED', detail: 'Workflow step này không phải chặng Ride có thể kích hoạt.', retryable: false });
    }
    if (step.status !== 'PENDING') {
      throw new ConflictException({ code: 'RIDE_STEP_NOT_PENDING', detail: 'Chặng Ride không còn ở trạng thái chờ kích hoạt.', retryable: false });
    }
    if (step.depends_on.some((dependency) => plan.steps.find((candidate) => candidate.id === dependency)?.status !== 'SUCCEEDED')) {
      throw new ConflictException({ code: 'WORKFLOW_DEPENDENCY_NOT_SATISFIED', detail: 'Cần hoàn tất bước phụ thuộc trước khi kích hoạt chặng Ride.', retryable: false });
    }

    const sourceAuthority = plan.kind === 'restaurant_ride' ? 'restaurant-service' : 'healthcare-service';
    const source = await this.resolveSource(
      plan.kind,
      { id: plan.destination?.resource_id ?? '', authority: sourceAuthority },
      actorId,
      correlationId,
    );
    const destination = authoritativeDestination(source);
    if (!destination?.coordinates || destination.coordinate_status !== 'validated' || !destination.address) {
      throw new BadRequestException({ code: 'AUTHORITATIVE_DESTINATION_UNRESOLVED', detail: 'Chưa có địa chỉ và tọa độ xác thực cho điểm đến.', retryable: true });
    }
    const pickup = body.pickup_latitude !== undefined && body.pickup_longitude !== undefined
      ? { address: body.pickup_address.trim(), coordinate: { latitude: body.pickup_latitude, longitude: body.pickup_longitude } }
      : await this.resolvePickup(body.pickup_address);
    const route = await this.locations.route(pickup.coordinate, destination.coordinates);
    if (route.status !== 'RESOLVED' || route.provider !== 'geoapify' || !route.route_geometry?.length || !route.route_snapshot_hash) {
      throw new BadRequestException({ code: 'REAL_ROUTE_REQUIRED', detail: 'Chưa lấy được tuyến đường xác thực cho chặng Ride.', retryable: true });
    }
    const quote = await this.ride.createQuote(actorId, idempotencyKey, { correlationId, workflowId }, {
      pickup_address: pickup.address,
      dropoff_address: destination.address,
      vehicle_type: body.vehicle_type ?? 'CAR_4',
      passenger_count: body.passenger_count ?? 1,
      ...(body.pickup_time ? { pickup_time: body.pickup_time } : {}),
      pickup_latitude: pickup.coordinate.latitude,
      pickup_longitude: pickup.coordinate.longitude,
      dropoff_latitude: destination.coordinates.latitude,
      dropoff_longitude: destination.coordinates.longitude,
      route_provider: route.provider,
      route_distance_meters: route.route_distance_meters,
      route_duration_seconds: route.route_duration_seconds,
      route_geometry: route.route_geometry,
      route_snapshot_hash: route.route_snapshot_hash,
    });
    return this.applyStepResult(record, stepId, { status: 'SUCCEEDED', idempotency_key: idempotencyKey, payload_hash: activationHash, result: { quote } }, correlationId);
  }

  private async resolvePickup(address: string): Promise<{ address: string; coordinate: { latitude: number; longitude: number } }> {
    const result = await this.locations.geocode(address);
    const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
    if (!candidate || candidate.latitude === null || candidate.longitude === null) {
      throw new BadRequestException({ code: 'LOCATION_UNRESOLVED', detail: 'Chưa xác định được điểm đón.', retryable: true });
    }
    return { address: candidate.address_text, coordinate: { latitude: candidate.latitude, longitude: candidate.longitude } };
  }

  async applyCompensation(actorId: string, workflowId: string, compensationId: string, idempotencyKey: string, body: StepResultDto, correlationId: string): Promise<MultiServicePlan> {
    const record = await this.requireRecord(actorId, workflowId);
    const plan = record.plan as unknown as MultiServicePlan;
    let next: MultiServicePlan;
    try {
      next = recordCompensationResult(plan, compensationId, { status: body.status, idempotency_key: idempotencyKey, payload_hash: body.payload_hash, error_code: body.error_code, result: body.result });
    } catch (error) {
      throw mapWorkflowError(error);
    }
    await this.save({ ...record, status: next.status, plan: next as unknown as Record<string, unknown>, updatedAt: next.updated_at });
    await this.core.audit({ action: 'MULTI_SERVICE_COMPENSATION_RECORDED', actorId, correlationId, resourceId: workflowId, metadata: { compensation_id: compensationId, status: body.status } });
    return next;
  }

  rank(body: RankCandidatesDto): Candidate[] {
    const candidates = body.candidates.map((candidate, index) => {
      if (typeof candidate.id !== 'string' || !candidate.id.trim()) throw new BadRequestException({ code: 'CANDIDATE_ID_REQUIRED', detail: `Candidate ${index + 1} thiếu id.`, retryable: false });
      return candidate as Candidate;
    });
    return rankCandidates(candidates, body.origin);
  }

  private async requireRecord(actorId: string, workflowId: string): Promise<MultiServiceWorkflowRecord> {
    const record = await this.core.getMultiServiceWorkflow(workflowId, actorId);
    if (!record) throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', detail: 'Không tìm thấy workflow đa dịch vụ.', retryable: false });
    return record;
  }

  private async applyStepResult(record: MultiServiceWorkflowRecord, stepId: string, result: StepResult, correlationId: string): Promise<MultiServicePlan> {
    let next: MultiServicePlan;
    try {
      next = recordStepResult(record.plan as unknown as MultiServicePlan, stepId, result);
    } catch (error) {
      throw mapWorkflowError(error);
    }
    await this.save({ ...record, status: next.status, plan: next as unknown as Record<string, unknown>, updatedAt: next.updated_at });
    await this.core.audit({ action: 'MULTI_SERVICE_STEP_RECORDED', actorId: record.actorId, correlationId, resourceId: record.workflowId, metadata: { step_id: stepId, status: result.status, error_code: result.error_code } });
    return next;
  }

  private save(value: MultiServiceWorkflowRecord): Promise<MultiServiceWorkflowRecord> {
    return this.core.saveMultiServiceWorkflow(value).catch((error: unknown) => { throw mapWorkflowError(error); });
  }
}

@Controller('api/v1/workflows/multi-service')
@UseGuards(AuthGuard)
export class MultiServiceReliabilityController {
  constructor(private readonly reliability: MultiServiceReliabilityService) {}

  @Post('plan')
  async plan(@Body() body: MultiServicePlanDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho workflow.', retryable: false });
    const data = await this.reliability.createPlan(request.user.sub, idempotencyKey.trim(), body, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Get(':workflowId')
  async get(@Param('workflowId') workflowId: string, @Req() request: AuthenticatedRequest): Promise<object> {
    const data = await this.reliability.getPlan(request.user.sub, workflowId);
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post(':workflowId/steps/:stepId/result')
  async step(@Param('workflowId') workflowId: string, @Param('stepId') stepId: string, @Body() body: StepResultDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho kết quả task.', retryable: false });
    const data = await this.reliability.applyStep(request.user.sub, workflowId, stepId, idempotencyKey.trim(), body, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post(':workflowId/steps/:stepId/activate')
  async activate(@Param('workflowId') workflowId: string, @Param('stepId') stepId: string, @Body() body: RideActivationDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho kích hoạt chặng Ride.', retryable: false });
    const data = await this.reliability.activateRideStep(request.user.sub, workflowId, stepId, idempotencyKey.trim(), body, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }

  @Post(':workflowId/compensations/:compensationId/result')
  async compensation(@Param('workflowId') workflowId: string, @Param('compensationId') compensationId: string, @Body() body: StepResultDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho compensation.', retryable: false });
    const data = await this.reliability.applyCompensation(request.user.sub, workflowId, compensationId, idempotencyKey.trim(), body, request.correlationId ?? 'cor_unknown');
    return { data, meta: { request_id: request.correlationId } };
  }
}

@Controller('api/v1/recommendations')
@UseGuards(AuthGuard)
export class RecommendationController {
  constructor(private readonly reliability: MultiServiceReliabilityService) {}

  @Post('rank')
  rank(@Body() body: RankCandidatesDto, @Req() request: AuthenticatedRequest): object {
    return { data: { items: this.reliability.rank(body) }, meta: { request_id: request.correlationId } };
  }
}

@Module({ imports: [AuthModule, CoreModule, ClientsModule, PersonalModule], controllers: [MultiServiceReliabilityController, RecommendationController], providers: [MultiServiceReliabilityService], exports: [MultiServiceReliabilityService] })
export class ReliabilityModule {}

function normalizeSource(source: AuthoritativeResourceDto): AuthoritativeResource {
  return {
    id: source.id.trim(),
    authority: source.authority,
  };
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined;
}

function hashRequest(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mapWorkflowError(error: unknown): Error {
  const code = error instanceof Error ? error.message : 'WORKFLOW_ERROR';
  if (code === 'IDEMPOTENCY_KEY_REUSED' || code === 'IDEMPOTENCY_CONFLICT') return new ConflictException({ code, detail: 'Idempotency-Key đã được dùng với payload khác.', retryable: false });
  if (code === 'FORBIDDEN') return new ConflictException({ code: 'WORKFLOW_ACTOR_MISMATCH', detail: 'Workflow không thuộc actor hiện tại.', retryable: false });
  if (code === 'WORKFLOW_STEP_NOT_FOUND' || code === 'COMPENSATION_NOT_FOUND') return new BadRequestException({ code, detail: 'Task hoặc compensation không tồn tại.', retryable: false });
  if (code === 'WORKFLOW_DEPENDENCY_NOT_SATISFIED' || code === 'WORKFLOW_STEP_NOT_EXECUTABLE') return new ConflictException({ code, detail: 'Task chưa đủ điều kiện thực thi theo dependency policy.', retryable: false });
  return new ConflictException({ code, detail: 'Workflow state không thể cập nhật an toàn.', retryable: true });
}
