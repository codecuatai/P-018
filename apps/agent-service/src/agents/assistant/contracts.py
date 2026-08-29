from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Domain(StrEnum):
    FOOD = "food"
    RESTAURANT = "restaurant"
    HEALTHCARE = "healthcare"
    RIDE = "ride"


class Operation(StrEnum):
    DISCOVER = "DISCOVER"
    CREATE = "CREATE"
    STATUS = "STATUS"
    UPDATE = "UPDATE"
    CANCEL = "CANCEL"


class InteractionMode(StrEnum):
    SERVICE = "service"
    CHITCHAT = "chitchat"
    ADVISORY = "advisory"
    UNSUPPORTED = "unsupported"


class SlotSource(StrEnum):
    USER_EXPLICIT = "USER_EXPLICIT"
    CONVERSATION_REFERENCE = "CONVERSATION_REFERENCE"
    AUTHORITATIVE_CONTEXT = "AUTHORITATIVE_CONTEXT"
    INFERRED_PREFERENCE = "INFERRED_PREFERENCE"


SlotValue: TypeAlias = StrictStr | StrictInt | StrictFloat | StrictBool


class SemanticSlot(StrictModel):
    value: SlotValue
    source: SlotSource
    confidence: float | None = Field(default=None, ge=0, le=1)


class RideSemanticSlots(StrictModel):
    pickup_address: SemanticSlot | None = None
    pickup_latitude: SemanticSlot | None = None
    pickup_longitude: SemanticSlot | None = None
    dropoff_address: SemanticSlot | None = None
    dropoff_latitude: SemanticSlot | None = None
    dropoff_longitude: SemanticSlot | None = None
    stopover_address: SemanticSlot | None = None
    vehicle_type: SemanticSlot | None = None
    passenger_count: SemanticSlot | None = None
    promo_code: SemanticSlot | None = None


class RestaurantSemanticSlots(StrictModel):
    location: SemanticSlot | None = None
    cuisine_type: SemanticSlot | None = None
    cuisine_query: SemanticSlot | None = None
    budget_range: SemanticSlot | None = None
    party_size: SemanticSlot | None = None
    start_at: SemanticSlot | None = None
    duration_minutes: SemanticSlot | None = None
    seating_type: SemanticSlot | None = None
    selection: SemanticSlot | None = None
    special_requests: SemanticSlot | None = None


class HealthcareSemanticSlots(StrictModel):
    department: SemanticSlot | None = None
    symptoms: SemanticSlot | None = None
    start_at: SemanticSlot | None = None
    time_preference: SemanticSlot | None = None
    selection: SemanticSlot | None = None


class FoodSemanticSlots(StrictModel):
    query: SemanticSlot | None = None
    dish_query: SemanticSlot | None = None
    location: SemanticSlot | None = None
    district: SemanticSlot | None = None
    category: SemanticSlot | None = None
    max_price: SemanticSlot | None = None
    delivery_preference: SemanticSlot | None = None
    selection: SemanticSlot | None = None
    quantity: SemanticSlot | None = None
    selected_options: SemanticSlot | None = None
    note: SemanticSlot | None = None
    voucher_code: SemanticSlot | None = None
    address_reference: SemanticSlot | None = None
    payment_method: SemanticSlot | None = None


DomainSlots: TypeAlias = RideSemanticSlots | RestaurantSemanticSlots | HealthcareSemanticSlots | FoodSemanticSlots


class ReferenceResolution(StrEnum):
    RESOLVED = "RESOLVED"
    AMBIGUOUS = "AMBIGUOUS"
    UNRESOLVED = "UNRESOLVED"


class SemanticReference(StrictModel):
    expression: str = Field(min_length=1, max_length=200)
    reference_type: Literal[
        "candidate",
        "saved_address",
        "previous_task",
        "previous_result",
        "current_location",
    ]
    target_task_ref: int | None = Field(default=None, ge=0)
    target_domain: Domain | None = None
    resolution: ReferenceResolution


class SemanticAmbiguity(StrictModel):
    code: str = Field(min_length=1, max_length=100)
    candidate_intent_refs: list[int] = Field(default_factory=list, max_length=4)
    detail: str = Field(min_length=1, max_length=500)


class ConstraintStrength(StrEnum):
    HARD = "HARD"
    SOFT = "SOFT"


class SemanticConstraint(StrictModel):
    strength: ConstraintStrength
    text: str = Field(min_length=1, max_length=500)
    actionable: bool = False


class SemanticIntent(StrictModel):
    intent_ref: int = Field(ge=0, le=3)
    domain: Domain
    operation: Operation
    goal: str = Field(min_length=1, max_length=500)
    normalized_request: str = Field(min_length=1, max_length=2000)
    slots: DomainSlots
    references: list[SemanticReference] = Field(default_factory=list, max_length=8)
    constraints: list[SemanticConstraint] = Field(default_factory=list, max_length=8)
    explicit_confirmation_language: bool = False

    @model_validator(mode="after")
    def slots_match_domain(self) -> SemanticIntent:
        expected = {
            Domain.FOOD: FoodSemanticSlots,
            Domain.RESTAURANT: RestaurantSemanticSlots,
            Domain.HEALTHCARE: HealthcareSemanticSlots,
            Domain.RIDE: RideSemanticSlots,
        }[self.domain]
        if not isinstance(self.slots, expected):
            raise ValueError(f"slots must use {expected.__name__} for {self.domain.value}")
        return self


class SemanticTurn(StrictModel):
    intents: list[SemanticIntent] = Field(default_factory=list, max_length=4)
    ambiguity: list[SemanticAmbiguity] = Field(default_factory=list, max_length=8)
    unsupported_requests: list[str] = Field(default_factory=list, max_length=8)
    language: Literal["vi", "en", "mixed", "unknown"] = "unknown"
    interaction_mode: InteractionMode = InteractionMode.SERVICE
    discarded_task_refs: list[int] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def intent_refs_are_unique(self) -> SemanticTurn:
        refs = [intent.intent_ref for intent in self.intents]
        if len(refs) != len(set(refs)):
            raise ValueError("intent_ref values must be unique")
        if len(self.discarded_task_refs) != len(set(self.discarded_task_refs)):
            raise ValueError("discarded_task_refs values must be unique")
        return self


class FactType(StrEnum):
    SELECTED_CANDIDATE = "selected_candidate"
    SAVED_ADDRESS = "saved_address"
    RESOURCE_SNAPSHOT = "resource_snapshot"
    QUOTE = "quote"
    BOOKING_STATE = "booking_state"


class AuthoritativeFact(StrictModel):
    fact_type: FactType
    field: str = Field(min_length=1, max_length=120)
    value: StrictStr | StrictInt | StrictBool
    source_task_ref: int | None = Field(default=None, ge=0)
    resource_version: StrictStr | StrictInt | None = None
    expires_at: datetime | None = None


class PlannerTaskContext(StrictModel):
    task_ref: int = Field(ge=0)
    domain: Domain
    phase: str = Field(min_length=1, max_length=80)
    revision: int = Field(default=0, ge=0)
    depends_on: list[int] = Field(default_factory=list, max_length=4)
    facts: list[AuthoritativeFact] = Field(default_factory=list, max_length=32)


class PlannerContext(StrictModel):
    tasks: list[PlannerTaskContext] = Field(default_factory=list, max_length=8)


class RiskLevel(StrEnum):
    READ = "READ"
    REVERSIBLE_WRITE = "REVERSIBLE_WRITE"
    FINANCIAL_OR_FINAL = "FINANCIAL_OR_FINAL"


class ConfirmationGate(StrEnum):
    NONE = "NONE"
    SERVICE_DETAILS = "SERVICE_DETAILS"
    FINAL_COMMIT = "FINAL_COMMIT"
    PAYMENT = "PAYMENT"
    CANCELLATION = "CANCELLATION"


class CapabilityStatus(StrEnum):
    IMPLEMENTED = "implemented"
    SKELETON = "skeleton"


class CapabilityDefinition(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    domain: Domain
    schema_version: str = Field(min_length=1, max_length=40)
    risk_level: RiskLevel
    confirmation_gate: ConfirmationGate
    status: CapabilityStatus
    input_fields: tuple[str, ...] = ()


class CapabilitySnapshot(StrictModel):
    version: str = Field(min_length=1, max_length=80)
    capabilities: list[CapabilityDefinition] = Field(default_factory=list, max_length=128)

    @model_validator(mode="after")
    def capability_names_are_unique(self) -> CapabilitySnapshot:
        names = [item.name for item in self.capabilities]
        if len(names) != len(set(names)):
            raise ValueError("capability names must be unique")
        return self


class AuthorityRequirement(StrictModel):
    source_task_ref: int | None = Field(default=None, ge=0)
    fact: str = Field(min_length=1, max_length=120)
    required_version: bool = False
    must_be_unexpired: bool = False


class PlanningPhase(StrEnum):
    PLANNING = "PLANNING"
    NEEDS_INFO = "NEEDS_INFO"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    DISCOVERY = "DISCOVERY"
    SELECTION = "SELECTION"
    AVAILABILITY = "AVAILABILITY"
    DRAFT_WRITE = "DRAFT_WRITE"
    QUOTE_OR_PREVIEW = "QUOTE_OR_PREVIEW"
    SERVICE_CONFIRMATION = "SERVICE_CONFIRMATION"
    FINAL_COMMIT = "FINAL_COMMIT"
    PAYMENT_CONFIRMATION = "PAYMENT_CONFIRMATION"
    STATUS = "STATUS"
    CANCELLATION_PREVIEW = "CANCELLATION_PREVIEW"
    CANCELLATION_CONFIRMATION = "CANCELLATION_CONFIRMATION"


class TaskDisposition(StrEnum):
    READY = "READY"
    NEEDS_INFO = "NEEDS_INFO"
    WAITING = "WAITING"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"


class StepKind(StrEnum):
    CAPABILITY = "CAPABILITY"
    WAIT_FOR_CONFIRMATION = "WAIT_FOR_CONFIRMATION"


class PlannedStep(StrictModel):
    step_ref: int = Field(ge=0)
    purpose: str = Field(min_length=1, max_length=500)
    step_kind: StepKind
    capability: str | None = Field(default=None, max_length=160)
    phase: PlanningPhase
    requires_semantic_fields: list[str] = Field(default_factory=list, max_length=16)
    requires_authority: list[AuthorityRequirement] = Field(default_factory=list, max_length=16)
    depends_on_steps: list[int] = Field(default_factory=list, max_length=16)
    risk_ceiling: RiskLevel
    confirmation_gate: ConfirmationGate

    @model_validator(mode="after")
    def step_kind_has_unambiguous_policy(self) -> PlannedStep:
        if self.step_kind == StepKind.CAPABILITY:
            if self.capability is None:
                raise ValueError("capability step must name a capability")
            return self
        if self.capability is not None:
            raise ValueError("confirmation waiting step must not name a capability")
        expected_gates = {
            PlanningPhase.SERVICE_CONFIRMATION: ConfirmationGate.SERVICE_DETAILS,
            PlanningPhase.PAYMENT_CONFIRMATION: ConfirmationGate.PAYMENT,
            PlanningPhase.CANCELLATION_CONFIRMATION: ConfirmationGate.CANCELLATION,
        }
        expected_gate = expected_gates.get(self.phase)
        if expected_gate is None or self.confirmation_gate != expected_gate:
            raise ValueError("confirmation waiting step has an invalid phase or confirmation gate")
        return self


class CoreAPlannedTask(StrictModel):
    task_ref: int = Field(ge=0, le=3)
    domain: Domain
    operation: Operation
    goal: str = Field(min_length=1, max_length=500)
    normalized_request: str = Field(min_length=1, max_length=2000)
    semantic_slots: DomainSlots
    constraints: list[SemanticConstraint] = Field(default_factory=list, max_length=8)
    depends_on: list[int] = Field(default_factory=list, max_length=4)
    missing_information: list[str] = Field(default_factory=list, max_length=16)
    missing_authority: list[AuthorityRequirement] = Field(default_factory=list, max_length=16)
    steps: list[PlannedStep] = Field(default_factory=list, max_length=16)
    disposition: TaskDisposition = TaskDisposition.READY
    blocking_task_ref: int | None = Field(default=None, ge=0)


class ClarificationNeed(StrictModel):
    task_ref: int | None = Field(default=None, ge=0)
    code: str = Field(min_length=1, max_length=100)
    missing_fields: list[str] = Field(default_factory=list, max_length=16)
    reason: str = Field(min_length=1, max_length=500)


class WorkflowRelation(StrEnum):
    SINGLE_TASK = "SINGLE_TASK"
    INDEPENDENT_TASKS = "INDEPENDENT_TASKS"
    DEPENDENT_TASKS = "DEPENDENT_TASKS"
    MIXED = "MIXED"


class ReplanDirective(StrEnum):
    CONTINUE = "CONTINUE"
    ASK_USER = "ASK_USER"
    REFRESH_AUTHORITY = "REFRESH_AUTHORITY"
    REQUOTE_OR_REPREVIEW = "REQUOTE_OR_REPREVIEW"
    WAIT_AND_RETRY_SAME_KEY = "WAIT_AND_RETRY_SAME_KEY"
    BLOCK_DEPENDENTS = "BLOCK_DEPENDENTS"
    TERMINAL_FAILURE = "TERMINAL_FAILURE"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"


class PlanningDecision(StrictModel):
    contract_version: Literal["core-a.v1"] = "core-a.v1"
    capability_catalog_version: str = Field(default="unavailable", min_length=1, max_length=80)
    tasks: list[CoreAPlannedTask] = Field(default_factory=list, max_length=4)
    clarification_need: ClarificationNeed | None = None
    workflow_relation: WorkflowRelation = WorkflowRelation.SINGLE_TASK
    replan_directive: ReplanDirective | None = None
    confirmation_invalidated: bool = False
    blocked_task_refs: list[int] = Field(default_factory=list, max_length=4)
    interaction_mode: InteractionMode = InteractionMode.SERVICE
    discarded_task_refs: list[int] = Field(default_factory=list, max_length=8)


class StepOutcomeKind(StrEnum):
    SUCCEEDED = "SUCCEEDED"
    EMPTY_RESULT = "EMPTY_RESULT"
    REJECTED = "REJECTED"
    RETRYABLE_FAILURE = "RETRYABLE_FAILURE"
    UNKNOWN = "UNKNOWN"


class StepOutcome(StrictModel):
    task_ref: int = Field(ge=0, le=3)
    step_ref: int = Field(ge=0)
    capability: str = Field(min_length=1, max_length=160)
    outcome: StepOutcomeKind
    error_code: str | None = Field(default=None, max_length=120)
    retryable: bool = False
    authoritative_facts: list[AuthoritativeFact] = Field(default_factory=list, max_length=32)


class UIAction(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    kind: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    target_index: int | None = Field(default=None, ge=0)


class UICard(StrictModel):
    kind: str = Field(min_length=1, max_length=100)
    title: str | None = Field(default=None, max_length=200)
    # The rest of the card is polymorphic and depends on the kind.
    # We use extra='allow' or a dict for the payload in practice,
    # but since this is StrictModel we might need a payload dict.
    # Let's keep it simple: just allow extra fields for UICard.
    model_config = ConfigDict(extra="allow")


class GroundingEnvelope(StrictModel):
    workflow_id: str | None = Field(default=None, max_length=100)
    phase: PlanningPhase | None = None
    outcome: StepOutcomeKind | None = None
    error_code: str | None = Field(default=None, max_length=120)
    authoritative_cards: list[UICard] = Field(default_factory=list, max_length=16)
    missing_information: list[str] = Field(default_factory=list, max_length=16)
    actions: list[UIAction] = Field(default_factory=list, max_length=16)
    confirmation_gate: ConfirmationGate | None = None
    next_step_capability: str | None = Field(default=None, max_length=160)
    safe_source_refs: list[str] = Field(default_factory=list, max_length=16)


class CoreAInput(StrictModel):
    semantic_turn: SemanticTurn
    planner_context: PlannerContext
    capability_snapshot: CapabilitySnapshot
