# System Overview

X-One is a conversational platform for multi-domain booking and ordering. It is backend-first: web and mobile have one public backend, while a NestJS gateway centrally orchestrates agent and domain capabilities.

Principles: domain ownership, REST/JSON/OpenAPI contracts, explicit confirmation for important side effects, idempotent writes, and least-privilege data/environment access. Public traffic ends at the gateway; all remaining links are private service links.

```mermaid
flowchart LR
  Web[Web] --> Gateway[NestJS Gateway]
  Mobile[Mobile] --> Gateway
  Gateway --> Agent[AI Agent]
  Gateway --> Ride[Ride]
  Gateway --> Restaurant[Restaurant]
  Gateway --> Healthcare[Healthcare]
  Gateway --> Food[Food]
```

```mermaid
flowchart TB
    classDef client fill:#EBF5FB,stroke:#2980B9,stroke-width:2px,color:#1B4F72;
    classDef gateway fill:#FEF9E7,stroke:#F39C12,stroke-width:2px,color:#7D6608;
    classDef agent fill:#E8F8F5,stroke:#1ABC9C,stroke-width:2px,color:#0E6251;
    classDef domain fill:#F4ECF7,stroke:#8E44AD,stroke-width:2px,color:#4A235A;
    classDef database fill:#EAECEE,stroke:#34495E,stroke-width:2px,color:#1B2631;

    subgraph ClientLayer["1. Client Layer"]
        Web["Web Application\n(Next.js App Router)"]:::client
        Mobile["Mobile Shell\n(React Native / Expo)"]:::client
    end

    subgraph GatewayLayer["2. Public Gateway & Orchestration"]
        Gateway["NestJS API Gateway (Port :3000)\n- Core Workflow Orchestration\n- Confirmation & Idempotency Engine\n- Audit Log & Payment Sandbox"]:::gateway
    end

    subgraph AgentLayer["3. Intelligence Layer (AI Agent)"]
        Agent["Agent Service (Port :8001 - FastAPI & LangGraph)\n- Intent Classification & Slot Filling\n- Generates Typed Tool Requests"]:::agent
    end

    subgraph DomainLayer["4. Domain Microservices Layer (FastAPI)"]
        Ride["Ride Service (:8101)\n- Ride booking & quotes"]:::domain
        Restaurant["Restaurant Service (:8102)\n- Dine-in table reservations"]:::domain
        Healthcare["Healthcare Service (:8103)\n- Medical appointment bookings"]:::domain
        Food["Food Service (:8104)\n- Menus & Food delivery ordering"]:::domain
    end

    subgraph DataLayer["5. Data Layer (Logical Isolation)"]
        CoreDB[("xone_core\n(Core DB)")]:::database
        AgentDB[("xone_agent\n(Provisioned target DB)")]:::database
        RideDB[("xone_ride\n(Ride DB)")]:::database
        RestDB[("xone_restaurant\n(Restaurant DB)")]:::database
        HealthDB[("xone_healthcare\n(Healthcare DB)")]:::database
        FoodDB[("xone_food\n(Food DB)")]:::database
    end

    Web -->|HTTP / REST| Gateway
    Mobile -->|HTTP / REST| Gateway

    Gateway <-->|Tool Requests & Results| Agent

    Gateway -->|Typed Client Adapter| Ride
    Gateway -->|Typed Client Adapter| Restaurant
    Gateway -->|Typed Client Adapter| Healthcare
    Gateway -->|Typed Client Adapter| Food

    Gateway -.->|SQL Connection| CoreDB
    Agent -.->|Not wired in current MVP| AgentDB
    Ride -.->|SQL Connection| RideDB
    Restaurant -.->|SQL Connection| RestDB
    Healthcare -.->|SQL Connection| HealthDB
    Food -.->|SQL Connection| FoodDB
```

The current integrated local scope covers Food ordering, Ride booking/tracking simulation, Restaurant dine-in discovery/availability/holds/final confirmation, Healthcare doctor/department/patient/slot/hold/payment acknowledgement/final confirmation/cancellation, Core profile/saved addresses/conversations/history, service browsing, real-catalog provenance, deterministic ranking, and durable multi-service workflow planning through Gateway orchestration and typed Agent requests. The Agent workflow store is currently process-local; the provisioned `xone_agent` database is a target persistence seam, not a wired dependency. Final Restaurant and Healthcare actions still require explicit confirmation; Ride and Healthcare payment are local simulations/adapters. Production payment providers, queues, service mesh, Kubernetes and Redis remain outside this scope. Gate G2 manual evaluation evidence is maintained under [root eval](../../eval/README.md). The evidence-backed component matrix, ports, local commands, and environment-dependent limits live in the canonical [current architecture state](current-state.md).
