import type { JsonObject } from '../../clients/service.clients';

export type MultiServiceWorkflowStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'COMPENSATING'
  | 'RECOVERY_REQUIRED';
export type DependencyPolicy = 'STOP_DEPENDENTS' | 'CONTINUE_INDEPENDENT';
export type CompensationPolicy = 'NONE' | 'USER_CONFIRM_REQUIRED' | 'AUTOMATIC_SAFE_COMPENSATION';
export type MultiServiceKind = 'restaurant_ride' | 'healthcare_ride' | 'food_healthcare';
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export type AuthoritativeResource = {
  id: string;
  authority: 'restaurant-service' | 'healthcare-service';
  address?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  coordinate_status?: string;
};

export type AuthoritativeDestination = {
  resource_id: string;
  authority: AuthoritativeResource['authority'];
  address?: string;
  coordinates?: { latitude: number; longitude: number };
  coordinate_status: 'validated' | 'missing' | 'suspicious_default';
};

export type MultiServiceStep = {
  id: string;
  domain: 'food' | 'restaurant' | 'healthcare' | 'ride';
  action: string;
  depends_on: string[];
  dependency_policy: DependencyPolicy;
  compensation_policy: CompensationPolicy;
  status: StepStatus;
  error_code?: string;
  result?: JsonObject;
  skip_reason?: string;
};

export type CompensationAction = {
  id: string;
  target_step_id: string;
  policy: Exclude<CompensationPolicy, 'NONE'>;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  error_code?: string;
};

export type MultiServicePlan = {
  workflow_id: string;
  actor_id: string;
  kind: MultiServiceKind;
  status: MultiServiceWorkflowStatus;
  dependency_policy: DependencyPolicy;
  steps: MultiServiceStep[];
  destination: AuthoritativeDestination | null;
  compensation: CompensationAction[];
  applied_idempotency: Record<string, string>;
  updated_at: string;
};

export type StepResult = {
  status: 'SUCCEEDED' | 'FAILED';
  idempotency_key: string;
  payload_hash?: string;
  error_code?: string;
  result?: JsonObject;
};

export type Candidate = JsonObject & {
  id: string;
  relevance?: number;
  distance_km?: number;
  eta_minutes?: number;
  price?: number;
  rating?: number;
  latitude?: number;
  longitude?: number;
  coordinate_status?: string;
};

export type RankedCandidate = Candidate & { rank_score: number; rank_distance_km?: number };

export function buildMultiServicePlan(
  workflowId: string,
  actorId: string,
  kind: MultiServiceKind,
  source: AuthoritativeResource,
  now = new Date().toISOString(),
): MultiServicePlan {
  const destination = authoritativeDestination(source);
  const steps = stepsFor(kind);
  return {
    workflow_id: workflowId,
    actor_id: actorId,
    kind,
    status: 'PENDING',
    dependency_policy: steps.some((step) => step.depends_on.length > 0) ? 'STOP_DEPENDENTS' : 'CONTINUE_INDEPENDENT',
    steps,
    destination,
    compensation: [],
    applied_idempotency: {},
    updated_at: now,
  };
}

export function authoritativeDestination(source: AuthoritativeResource): AuthoritativeDestination | null {
  if (!source.id.trim() || !source.authority) return null;
  const address = [source.address, source.location].find((value) => typeof value === 'string' && value.trim())?.trim();
  const validCoordinates = typeof source.latitude === 'number'
    && typeof source.longitude === 'number'
    && Number.isFinite(source.latitude)
    && Number.isFinite(source.longitude)
    && source.latitude >= -90
    && source.latitude <= 90
    && source.longitude >= -180
    && source.longitude <= 180;
  const coordinateStatus = source.coordinate_status === 'suspicious_default'
    ? 'suspicious_default'
    : validCoordinates ? 'validated' : 'missing';
  const coordinates = validCoordinates && coordinateStatus === 'validated'
    ? { latitude: source.latitude as number, longitude: source.longitude as number }
    : undefined;
  return {
    resource_id: source.id,
    authority: source.authority,
    ...(address ? { address } : {}),
    ...(coordinates ? { coordinates } : {}),
    coordinate_status: coordinateStatus,
  };
}

export function recordStepResult(plan: MultiServicePlan, stepId: string, result: StepResult, now = new Date().toISOString()): MultiServicePlan {
  const priorHash = plan.applied_idempotency[result.idempotency_key];
  const resultHash = result.payload_hash ?? stableResultHash(result);
  if (priorHash) {
    if (priorHash !== resultHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return plan;
  }
  const stepIndex = plan.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) throw new Error('WORKFLOW_STEP_NOT_FOUND');
  const steps = plan.steps.map((step) => ({ ...step, depends_on: [...step.depends_on] }));
  const step = steps[stepIndex];
  if (step.status === 'SUCCEEDED' || step.status === 'FAILED') return plan;
  if (step.status === 'SKIPPED') throw new Error('WORKFLOW_STEP_NOT_EXECUTABLE');
  if (step.depends_on.some((dependency) => steps.find((candidate) => candidate.id === dependency)?.status !== 'SUCCEEDED')) {
    throw new Error('WORKFLOW_DEPENDENCY_NOT_SATISFIED');
  }
  step.status = result.status;
  if (result.status === 'SUCCEEDED') {
    step.result = result.result;
    delete step.error_code;
  } else {
    step.error_code = result.error_code ?? 'STEP_FAILED';
  }
  propagateFailedDependencies(steps);
  const compensation = [...plan.compensation];
  if (result.status === 'FAILED') {
    for (const candidate of steps) {
      if (candidate.status !== 'SUCCEEDED' || candidate.compensation_policy === 'NONE') continue;
      const actionId = `compensate:${candidate.id}`;
      if (compensation.some((action) => action.id === actionId)) continue;
      compensation.push({ id: actionId, target_step_id: candidate.id, policy: candidate.compensation_policy, status: 'PENDING' });
    }
  }
  const status = compensation.some((action) => action.policy === 'AUTOMATIC_SAFE_COMPENSATION' && action.status === 'PENDING')
    ? 'COMPENSATING'
    : derivePlanStatus(steps, compensation);
  return { ...plan, status, steps, compensation, applied_idempotency: { ...(plan.applied_idempotency ?? {}), [result.idempotency_key]: resultHash }, updated_at: now };
}

export function recordCompensationResult(plan: MultiServicePlan, compensationId: string, result: StepResult, now = new Date().toISOString()): MultiServicePlan {
  const priorHash = plan.applied_idempotency?.[result.idempotency_key];
  const resultHash = result.payload_hash ?? stableResultHash(result);
  if (priorHash) {
    if (priorHash !== resultHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return plan;
  }
  const index = plan.compensation.findIndex((action) => action.id === compensationId);
  if (index < 0) throw new Error('COMPENSATION_NOT_FOUND');
  const compensation = plan.compensation.map((action) => ({ ...action }));
  if (compensation[index].status !== 'PENDING') return plan;
  compensation[index].status = result.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
  if (result.status === 'FAILED') compensation[index].error_code = result.error_code ?? 'COMPENSATION_FAILED';
  const status = compensation.some((action) => action.status === 'FAILED') ? 'RECOVERY_REQUIRED' : compensation.some((action) => action.status === 'PENDING') ? 'COMPENSATING' : 'PARTIAL_SUCCESS';
  return { ...plan, status, compensation, applied_idempotency: { ...(plan.applied_idempotency ?? {}), [result.idempotency_key]: resultHash }, updated_at: now };
}

export function rankCandidates(candidates: Candidate[], origin?: { latitude: number; longitude: number }): RankedCandidate[] {
  const distances = candidates.map((candidate) => candidateDistance(candidate, origin)).filter((value): value is number => value !== undefined);
  const maxDistance = distances.length ? Math.max(...distances) : 0;
  const maxEta = maxFinite(candidates.map((candidate) => finite(candidate.eta_minutes))) ?? 0;
  const maxPrice = maxFinite(candidates.map((candidate) => finite(candidate.price))) ?? 0;
  return candidates.map((candidate, index) => {
    const distance = candidateDistance(candidate, origin);
    const relevance = clamp(finite(candidate.relevance) ?? 0.5, 0, 1);
    const distanceScore = distance === undefined ? 0.5 : maxDistance === 0 ? 1 : 1 - clamp(distance / maxDistance, 0, 1);
    const etaScore = inverseScore(finite(candidate.eta_minutes), maxEta);
    const priceScore = inverseScore(finite(candidate.price), maxPrice);
    const ratingScore = ratingScoreFor(finite(candidate.rating));
    const score = 0.45 * relevance + 0.2 * distanceScore + 0.15 * etaScore + 0.1 * priceScore + 0.1 * ratingScore;
    return { candidate, index, distance, score };
  }).sort((left, right) => right.score - left.score || String(left.candidate.id).localeCompare(String(right.candidate.id)) || left.index - right.index).map(({ candidate, distance, score }) => ({
    ...candidate,
    rank_score: Number(score.toFixed(6)),
    ...(distance === undefined ? {} : { rank_distance_km: Number(distance.toFixed(2)) }),
  }));
}

function stepsFor(kind: MultiServiceKind): MultiServiceStep[] {
  if (kind === 'restaurant_ride') {
    return [
      step('restaurant_selection', 'restaurant', 'restaurant.select', [], 'NONE'),
      step('ride_quote', 'ride', 'ride.quote.create', ['restaurant_selection'], 'NONE'),
    ];
  }
  if (kind === 'healthcare_ride') {
    return [
      step('healthcare_appointment', 'healthcare', 'healthcare.appointment.confirm', [], 'NONE'),
      step('ride_quote', 'ride', 'ride.quote.create', ['healthcare_appointment'], 'NONE'),
    ];
  }
  return [
    step('food_order', 'food', 'food.order.confirm', [], 'USER_CONFIRM_REQUIRED'),
    step('healthcare_appointment', 'healthcare', 'healthcare.appointment.confirm', [], 'NONE'),
  ];
}

function step(id: string, domain: MultiServiceStep['domain'], action: string, dependsOn: string[], compensationPolicy: CompensationPolicy): MultiServiceStep {
  return { id, domain, action, depends_on: dependsOn, dependency_policy: dependsOn.length ? 'STOP_DEPENDENTS' : 'CONTINUE_INDEPENDENT', compensation_policy: compensationPolicy, status: 'PENDING' };
}

function propagateFailedDependencies(steps: MultiServiceStep[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (step.status !== 'PENDING' || step.dependency_policy !== 'STOP_DEPENDENTS') continue;
      if (step.depends_on.some((dependency) => steps.some((candidate) => candidate.id === dependency && ['FAILED', 'SKIPPED'].includes(candidate.status)))) {
        step.status = 'SKIPPED';
        step.skip_reason = 'DEPENDENCY_FAILED';
        changed = true;
      }
    }
  }
}

function derivePlanStatus(steps: MultiServiceStep[], compensation: CompensationAction[]): MultiServiceWorkflowStatus {
  if (steps.every((step) => step.status === 'PENDING')) return 'PENDING';
  if (steps.some((step) => step.status === 'RUNNING' || step.status === 'PENDING')) return 'RUNNING';
  const succeeded = steps.filter((step) => step.status === 'SUCCEEDED').length;
  const failed = steps.filter((step) => step.status === 'FAILED').length;
  const skipped = steps.filter((step) => step.status === 'SKIPPED').length;
  if (!failed && !skipped && succeeded === steps.length) return 'COMPLETED';
  if (succeeded > 0 || compensation.length > 0) return 'PARTIAL_SUCCESS';
  return 'FAILED';
}

function stableResultHash(result: StepResult): string {
  return JSON.stringify({ status: result.status, error_code: result.error_code ?? null, result: result.result ?? null });
}

function candidateDistance(candidate: Candidate, origin?: { latitude: number; longitude: number }): number | undefined {
  if (!origin || candidate.coordinate_status === 'suspicious_default') return finite(candidate.distance_km);
  const latitude = finite(candidate.latitude);
  const longitude = finite(candidate.longitude);
  if (latitude === undefined || longitude === undefined) return finite(candidate.distance_km);
  return haversineKm(origin.latitude, origin.longitude, latitude, longitude);
}

function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (latitudeB - latitudeA) * radians;
  const longitudeDelta = (longitudeB - longitudeA) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA * radians) * Math.cos(latitudeB * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function inverseScore(value: number | undefined, maximum: number): number {
  return value === undefined ? 0.5 : maximum === 0 ? 1 : 1 - clamp(value / maximum, 0, 1);
}

function ratingScoreFor(value: number | undefined): number {
  if (value === undefined) return 0.5;
  return clamp(value <= 5 ? value / 5 : value / 1000, 0, 1);
}

function maxFinite(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => value !== undefined);
  return valid.length ? Math.max(...valid) : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
