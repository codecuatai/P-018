# Agent Service Single-Agent Implementation Plan

## 1. Objective

Build `apps/agent-service/` as a production-oriented single-agent conversational layer for restaurant table reservations. The agent must understand user intent, collect and validate booking slots, and emit typed tool requests. It must not own restaurant business rules, call Restaurant Service directly, confirm a booking, execute side effects, or decide transaction success.

This plan covers the Agent/Gateway/Restaurant walking slice. It does not introduce multi-agent orchestration, queues, Redis, Kubernetes, payment processing, or cross-service database access.

## 2. Architecture boundary

```text
Client
  -> API Gateway
  -> Agent Service
  <- typed tool request / safe response
  -> API Gateway policy and orchestration
  -> Restaurant Service
```

### Agent Service owns

- Conversation interpretation, intent classification, and slot extraction.
- Conversation workflow state and approved checkpoint/run metadata.
- Typed tool-request generation.
- Safe response composition from validated gateway results.
- Model adapter abstraction and prompt/evaluation fixtures.

### Agent Service must not own

- Restaurant availability, holds, reservations, or lifecycle state.
- User authentication or authorization decisions.
- Direct Restaurant Service/database calls.
- Booking/payment confirmation or transaction success decisions.
- Raw chain-of-thought, secrets, or unnecessary sensitive data.

### Gateway owns

- JWT authentication and actor context.
- Role and risk policy.
- Tool request validation and dispatch.
- Restaurant client calls, confirmation evidence, idempotency, audit, and response shaping.

### Restaurant Service owns

- Restaurant/table availability.
- Reservation holds and reservations.
- Domain invariants, persistence, transactions, and authoritative success/failure.

## 3. Target Agent Service structure

```text
apps/agent-service/src/
├── api/
│   ├── routes.py
│   └── dependencies.py
├── application/
│   ├── chat_service.py
│   ├── workflow_service.py
│   └── tool_request_service.py
├── agents/
│   ├── graph.py
│   ├── state.py
│   ├── nodes/
│   │   ├── classify_intent.py
│   │   ├── extract_slots.py
│   │   ├── validate_slots.py
│   │   ├── decide_next_action.py
│   │   └── compose_response.py
│   └── policies/
│       ├── tool_policy.py
│       └── risk_policy.py
├── model/
│   ├── adapter.py
│   ├── gemini_adapter.py
│   └── fake_adapter.py
├── contracts/
│   ├── chat.py
│   ├── workflow.py
│   └── tool_requests.py
├── infrastructure/
│   ├── checkpoint_store.py
│   └── observability.py
└── main.py
```

Graph nodes should coordinate typed application services. Prompts must not contain authoritative business rules that belong to Gateway or Restaurant Service.

## 4. Conversation state

Use a typed state rather than passing unstructured prompt text between nodes:

```python
class BookingState(TypedDict, total=False):
    workflow_id: str
    actor_id: str
    intent: str
    restaurant_id: str
    location: str
    cuisine_type: str
    party_size: int
    start_at: str
    duration_minutes: int
    seating_type: str
    special_requests: str
    search_result: dict
    availability_result: dict
    hold_result: dict
    confirmation_status: str
    pending_tool_request: dict
    response: str
    status: str
```

The booking workflow states are:

```text
START
  -> CLASSIFY_INTENT
  -> COLLECT_MISSING_SLOTS
  -> SEARCH_RESTAURANTS
  -> CHECK_AVAILABILITY
  -> PRESENT_BOOKING_DRAFT
  -> WAIT_USER_CONFIRMATION
  -> CREATE_HOLD
  -> WAIT_FINAL_CONFIRMATION
  -> CREATE_RESERVATION
  -> BOOKING_COMPLETED
```

If the user changes a material value such as restaurant, date, time, or party size, invalidate the previous draft/confirmation and return to the relevant step.

## 5. Typed tool contract

Extend the existing generic tool schema with versioned, validated requests:

```json
{
  "tool_name": "restaurant.search",
  "risk_level": "READ",
  "workflow_id": "wf_123",
  "tool_call_id": "tc_123",
  "schema_version": "1",
  "arguments": {
    "location": "District 1",
    "cuisine_type": "Vietnamese",
    "party_size": 2
  }
}
```

Initial tools:

- `restaurant.search`
- `restaurant.get`
- `restaurant.check_availability`
- `restaurant.create_hold`
- `restaurant.create_reservation`
- `restaurant.get_reservation`
- `restaurant.cancel_reservation`

Every write request must carry an idempotency key. Tool requests must be validated by code after model output; model text cannot grant permission.

Risk policy:

| Risk | Examples | Required handling |
| --- | --- | --- |
| `READ` | Search, get restaurant, availability | Gateway policy and domain auth |
| `REVERSIBLE_WRITE` | Create/cancel hold | Explicit workflow/confirmation policy |
| `FINANCIAL_OR_FINAL` | Create final reservation/payment-bound action | Explicit confirmation evidence and one-time consumption |

## 6. Gateway orchestration contract

For each request, Gateway should:

1. Authenticate the user and derive `actor_id` and `role` from trusted JWT context.
2. Send the message plus minimal workflow context to Agent Service.
3. Validate the returned tool request against the versioned schema.
4. Apply role, risk, confirmation, and workflow policy.
5. Call Restaurant Service with trusted internal headers:
   - `X-Internal-Service-Token`
   - `X-Actor-Id`
   - `X-Correlation-Id`
   - `X-Workflow-Id`
   - `Idempotency-Key` for writes
6. Validate the domain response and persist audit/idempotency metadata.
7. Send only the validated result back to Agent for safe response composition.
8. Return the final response to the client; only Restaurant Service decides reservation success.

Agent Service must never receive authority to call the domain directly.

## 7. Roles and permissions

Gateway owns role policy:

| Role | MVP permission |
| --- | --- |
| `customer` | Search, availability, hold, create, read, and cancel own reservations |
| `provider` | No customer booking privileges beyond the explicitly documented policy; provider management is later scope |
| `operator` | Operational access only through a separately audited policy |
| `admin` | Administrative access through a separately audited policy |

Restaurant Service must still enforce actor ownership for reads/updates/cancels. Agent must not infer role from user text or model output.

## 8. Confirmation workflow

Use two explicit confirmations:

### Booking-details confirmation

The user confirms the normalized restaurant, date/time, party size, duration, seating type, and special requests.

### Final confirmation

Before the final side effect, the user confirms the current hold/resource version and any price, currency, expiry, or material terms.

Confirmation evidence must bind to actor, action, normalized payload/hash, workflow, resource/quote version, price/currency when applicable, expiry, and one-time consumption. Any material change requires new confirmation.

## 9. Model adapter

Do not call Gemini from graph nodes. Define a narrow adapter interface:

```python
class ModelAdapter(Protocol):
    async def classify_intent(self, request: IntentRequest) -> IntentResult: ...
    async def extract_slots(self, request: SlotExtractionRequest) -> SlotResult: ...
    async def compose_response(self, request: ResponseRequest) -> str: ...
```

Implement:

- `GeminiAdapter` for the real provider.
- `FakeModelAdapter` for deterministic tests.

Require structured model output, validate it against schemas, bound all fields, and treat user/provider/retrieved/tool content as untrusted data.

## 10. Persistence and observability

Agent may persist only approved metadata in `xone_agent`:

- Workflow metadata.
- Run metadata.
- Checkpoint metadata.
- Tool request metadata.
- Correlation and status information.

Do not persist raw chain-of-thought, raw system prompts, credentials, or unnecessary sensitive PII. Use structured logs with workflow, tool-call, and correlation IDs while excluding tokens and full sensitive bodies.

## 11. Implementation phases

### Phase 1: Contract and runtime foundation

- Define typed chat, workflow, state, and tool-request schemas.
- Add workflow/correlation metadata to Agent API.
- Introduce `ModelAdapter` and deterministic fake adapter.
- Keep the current chat endpoint backward-compatible where practical.

### Phase 2: Intent and slot extraction

- Add restaurant-booking intent classification.
- Extract and normalize location, restaurant, party size, date/time, duration, seating type, and special requests.
- Return missing-slot questions instead of guessing material values.
- Add deterministic tests and prompt-injection cases.

### Phase 3: Restaurant discovery

- Emit `restaurant.search` and `restaurant.get` requests.
- Implement Gateway validation and Restaurant client dispatch.
- Return responses based only on validated domain data.

### Phase 4: Availability and booking draft

- Emit `restaurant.check_availability`.
- Build a normalized booking draft.
- Ask for explicit booking-details confirmation.
- Invalidate the draft when material fields change.

### Phase 5: Hold and final reservation

- Add `restaurant.create_hold` with idempotency.
- Add confirmation evidence handling in Gateway.
- Add final reservation dispatch through Gateway.
- Return authoritative reservation ID/status from Restaurant Service.

### Phase 6: Lifecycle and recovery

- Add read, update, and cancel workflows.
- Handle expired holds, unavailable capacity, invalid confirmations, retries, timeouts, and safe conflicts.
- Add bounded retry only for safe/read operations; do not blindly retry final writes without idempotency.

### Phase 7: Production hardening

- Replace demo in-memory user/auth storage in Gateway.
- Add timeouts, rate limits, structured observability, and service authentication.
- Add contract, integration, concurrency, security, and end-to-end tests.
- Update OpenAPI, tool contracts, current-state documentation, and operational runbooks.

## 12. Test matrix

### Agent

- Intent classification for booking, discovery, cancellation, and unrelated chat.
- Missing and malformed slots.
- Timezone/date normalization.
- Structured output validation.
- Invalid tool name/risk/arguments.
- Prompt injection and untrusted retrieved content.
- No raw reasoning or sensitive data in public responses.

### Gateway

- Missing/expired/invalid JWT.
- Role policy and actor propagation.
- Tool schema validation.
- Confirmation binding and replay rejection.
- Idempotency propagation and conflict behavior.
- Restaurant timeout and safe error mapping.

### End-to-end

```text
Login customer
  -> Chat with missing booking details
  -> Agent asks for missing slots
  -> Search restaurant
  -> Check availability
  -> Confirm booking details
  -> Create hold
  -> Final confirmation
  -> Create reservation
  -> Return authoritative reservation ID
```

Also test changed payload after confirmation, hold expiry, duplicate final requests, cross-actor access, and domain capacity conflicts.

## 13. Definition of done

- Agent is a single agent with typed state and modular LangGraph nodes.
- Agent emits validated typed tool requests and never calls Restaurant Service directly.
- Gateway performs authentication, role/risk policy, orchestration, confirmation, idempotency, and audit.
- Restaurant Service remains the authority for availability and reservation state.
- A customer can complete the tested chat-to-reservation flow through the Gateway.
- Confirmation and idempotency protect all important side effects.
- Tests cover happy path, missing slots, invalid model output, authorization, conflicts, retries, and failure recovery.
- Public responses contain no chain-of-thought, secrets, raw prompts, or unsafe provider/tool content.
- Documentation and contracts accurately describe what is implemented; no multi-agent behavior is claimed.

## 14. Non-goals

- Multi-agent supervisor/specialist architecture.
- Agent calling domain services directly.
- Agent-owned booking or payment state.
- Queues, Redis, Kubernetes, service mesh, or additional infrastructure.
- Production payment integration before the confirmation/audit boundary is implemented.

## 15. Revision: production conversational behavior

The first implementation exposed an important gap: a graph can be structurally typed and still behave like a keyword demo. The following requirements supersede the initial deterministic-only implementation plan for user-facing conversation quality.

### 15.1 Current observed failures

- Each message is processed without reliable previous-turn state.
- `workflow_id` and accumulated slots are not consistently propagated from the web client.
- Intent detection depends on booking keywords in the current message. Follow-up messages such as `9h 30` or `Hà Nội` are therefore classified as general chat.
- Time parsing supports only narrow forms and invents a fixed date.
- Location, party size, date, and time are not merged from separate turns with provenance.
- The response fallback is hardcoded and is used for unrelated domains instead of explaining unsupported intent.
- The browser still calls the legacy `/api/v1/chat` route instead of the restaurant workflow route.
- Tool results are returned by Gateway but are not yet transformed into a grounded next conversational response.
- Gemini configuration exists, but no real model adapter is invoked.

### 15.2 Target multi-turn behavior

The agent must maintain a workflow snapshot per `(actor_id, workflow_id)` and merge every new turn into that snapshot:

```text
User: đặt bàn
  state: intent=restaurant_booking, missing=party_size,start_at
  response: hỏi số người và thời gian

User: 1 người
  state: party_size=1, missing=start_at
  response: hỏi ngày và giờ

User: 9h30
  state: start_time=09:30, missing=date/location
  response: hỏi ngày và nhà hàng/khu vực

User: Hà Nội
  state: location=Hà Nội, missing=date
  response: hỏi ngày cụ thể, không reset intent
```

Every turn must include or resolve:

- `actor_id` from Gateway, never from the user message.
- Stable `workflow_id` generated by Gateway and persisted by the client.
- `turn_id` and correlation ID.
- Current normalized workflow state version.
- New user message only; previous state is loaded server-side or passed as a signed/validated context.

### 15.3 Conversation state model

Replace the loose dictionary with Pydantic models and explicit field provenance:

```python
class SlotValue(BaseModel):
    value: Any
    source: Literal["user", "model", "tool", "system"]
    turn_id: str
    confidence: float = Field(ge=0, le=1)
    normalized: bool = False


class RestaurantBookingSlots(BaseModel):
    restaurant_id: SlotValue | None = None
    location: SlotValue | None = None
    party_size: SlotValue | None = None
    local_date: SlotValue | None = None
    local_time: SlotValue | None = None
    timezone: SlotValue | None = None
    duration_minutes: SlotValue | None = None
    seating_type: SlotValue | None = None
    special_requests: SlotValue | None = None
```

The persisted workflow also contains `intent`, `active_domain`, `status`, `last_question`, `pending_tool_call`, `last_tool_result_reference`, `state_version`, `expires_at`, and `locale`.

Material values must never be silently overwritten. If the user says `19h` after `9h30`, the agent should recognize a correction, update the slot, increment the state version, and invalidate any stale availability/confirmation.

### 15.4 Intent taxonomy

Use a closed, versioned intent taxonomy with an explicit unsupported route:

- `restaurant.discover`
- `restaurant.check_availability`
- `restaurant.create_reservation`
- `restaurant.read_reservation`
- `restaurant.cancel_reservation`
- `healthcare.request` (recognized but not implemented in this slice)
- `general.question`
- `clarification.answer`
- `confirmation.accept`
- `confirmation.reject`
- `correction.update_slot`
- `unsupported`

Intent classification must use the current workflow state. A short follow-up such as `Hà Nội` is `clarification.answer`, not `general.question`.

### 15.5 Date/time normalization

Create a deterministic Vietnamese date/time normalizer before tool generation:

- Support `9h30`, `9:30`, `09 giờ 30`, `tối nay`, `ngày mai`, weekday names, and explicit ISO dates.
- Resolve relative dates using an injected timezone-aware clock, never a hardcoded date.
- Require a timezone for ambiguous input; default only from the user's validated locale/profile.
- Reject past or ambiguous times with a focused clarification question.
- Preserve both display-local time and normalized UTC.
- Do not call Restaurant availability until date, time, party size, and restaurant/location requirements are complete.

### 15.6 Model-backed structured extraction

Implement `GeminiAdapter` behind the existing interface and configure `gemini-2.5-flash-lite` for classification/extraction. The adapter must:

- Request JSON/structured output only.
- Use a strict response schema for intent, slot patches, clarification, and confidence.
- Never receive service credentials or authority to call tools.
- Apply timeout and bounded retry policies.
- Redact sensitive values from logs.
- Fall back to deterministic parsing only for safe, narrow date/time/number normalization—not as the primary intent engine.

The fake adapter remains mandatory for unit tests. Real Gemini calls belong in an opt-in integration/evaluation suite, never the default test run.

### 15.7 Graph design

The graph should be a state machine, not a linear keyword pipeline:

```text
LOAD_WORKFLOW
  -> CLASSIFY_INTENT
  -> EXTRACT_SLOT_PATCH
  -> MERGE_AND_NORMALIZE
  -> VALIDATE_WORKFLOW
      -> ASK_CLARIFICATION
      -> PREPARE_READ_TOOL
      -> PREPARE_CONFIRMATION
      -> HANDLE_TOOL_RESULT
      -> COMPOSE_GROUNDED_RESPONSE
  -> SAVE_WORKFLOW
```

Each node must be deterministic around the model boundary and return typed errors. A failed model call must preserve the prior workflow state and ask the user to retry; it must not reset the conversation or emit a booking tool.

### 15.8 Tool-result grounding

Agent responses after a tool call must be generated from a validated `ToolResult` envelope. The agent must distinguish:

- `available=true`: present the actual restaurant/table facts and next required action.
- `available=false`: explain no availability and offer a safe alternative.
- `404`: ask the user to choose another restaurant/location.
- `409`: explain stale/conflicting state and refresh availability.
- timeout/5xx: provide a retryable service message without claiming success.

Never compose `Đã đặt bàn thành công` unless Gateway passes an authoritative successful Restaurant result.

### 15.9 API and client context contract

Change the public workflow request to carry a stable workflow:

```json
{
  "workflow_id": "wf_123",
  "message": "9h30",
  "client_turn_id": "turn_004"
}
```

The web client must:

- Store the current `workflow_id` per conversation.
- Call `/api/v1/restaurant-workflows/chat` for restaurant conversations.
- Send the same workflow ID for every turn.
- Render clarification prompts and tool results distinctly.
- Reset workflow only on explicit `New conversation`.

The legacy `/api/v1/chat` endpoint should be retained only as a documented general-chat compatibility route, not as the restaurant booking entry point.

### 15.10 Recovery and UX policy

- Ask exactly one focused question at a time when possible.
- Never ask again for a slot already present and valid in state.
- Confirm interpreted values for ambiguous input: `Mình hiểu là 9:30 sáng ngày ... đúng không?`
- If the user changes domain, acknowledge the switch and create a new domain workflow or route to an available capability.
- For unsupported healthcare requests, say that healthcare booking is not enabled yet; do not answer with restaurant text.
- Keep the last valid state on errors and show a retry option.
- Add conversation expiry and explicit reset behavior.

### 15.11 Revised implementation order

1. **Contract reset:** add workflow/turn IDs, typed state, intent taxonomy, slot patch schema, tool-result schema, and API compatibility rules.
2. **State persistence:** implement an agent workflow repository with SQLite/test adapter first and PostgreSQL-backed `xone_agent` adapter next; add optimistic state versioning.
3. **Normalization:** implement Vietnamese date/time/number/location normalization with injected clock and timezone tests.
4. **Model adapter:** implement Gemini structured extraction with fake adapter parity, timeout, schema validation, and safe fallback.
5. **Graph rewrite:** replace keyword-only graph with classify → patch → merge → validate → clarify/tool → result → response.
6. **Gateway propagation:** pass stable workflow/actor/turn context, route restaurant chat to the new endpoint, validate tool/result contracts, and enforce role policy.
7. **Grounded responses:** compose responses from validated Restaurant results and explicit error semantics.
8. **Write workflow:** only after read behavior is stable, add hold, two confirmations, idempotency, audit, and final reservation.
9. **Evaluation/rollout:** run deterministic scenario tests, shadow Gemini evaluation, feature flag, metrics, and controlled enablement.

### 15.12 Acceptance scenarios

The following conversations must pass without hardcoded fallback responses:

1. `đặt bàn` → asks party size; `1 người` → asks date/time; `9h30` → retains intent and asks date/location; `Hà Nội` → retains all slots and asks only the remaining slot.
2. `Đặt bàn cho 2 người ngày mai lúc 19h ở Hà Nội` → normalizes one request and emits a read tool only when all required slots are valid.
3. `Đổi thành 4 người` → updates only party size and invalidates stale availability.
4. `Hãy cho tôi danh sách bàn có thể đi` → asks for restaurant/date/time if absent, or checks availability if the workflow already contains them.
5. `Đặt thêm buổi kiểm tra sức khỏe` → routes to `healthcare.request`/unsupported response, never restaurant fallback.
6. Tool timeout → retains state, returns retryable message, and does not claim availability or booking.
7. Repeated identical message → does not duplicate write requests or lose workflow state.

### 15.13 Revised definition of done

- Multi-turn follow-ups merge into one persisted workflow.
- No material field is invented, silently overwritten, or lost between turns.
- Gemini structured extraction is behind a tested adapter boundary.
- Deterministic normalization handles Vietnamese date/time forms with timezone correctness.
- Frontend, Gateway, Agent, and Restaurant share the same workflow/turn contract.
- Responses are grounded in validated tool results and domain errors.
- Unsupported domains receive explicit unsupported responses, not unrelated restaurant text.
- The acceptance scenarios above pass in deterministic tests and the real Gemini adapter passes an opt-in evaluation suite.
- Reservation writes remain protected by Gateway confirmation/idempotency/audit and Restaurant domain authority.
