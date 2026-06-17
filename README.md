[![Docker Pulls](https://img.shields.io/docker/pulls/osasmatthew/multi-tenant-notification-engine?style=for-the-badge&logo=docker)](https://hub.docker.com/r/osasmatthew/multi-tenant-notification-engine)

# Multi-Tenant Asynchronous Notification Engine

An enterprise-grade, high-throughput notification ingestion and delivery system built using a decoupled **Hexagonal (Ports & Adapters) Architecture**. The system leverages asynchronous message queuing to decouple fast HTTP ingestion layers from slow external I/O operations (Slack, Telegram, SMTP), guaranteeing sub-millisecond client response times, data isolation across tenants, and resilient fault tolerance.

---

## 🏁 Architectural Highlights & Core Capabilities

* **Asynchronous Processing Pipeline:** Implements a strict producer-consumer split via distributed queues, keeping the API ingest loop non-blocking.
* **Data Isolation Matrix:** Strict multi-tenant security verification at the boundary using a high-performance **Cache-Aside validation design pattern**.
* **Structural Type Safety:** Ingestion telemetry validated via runtime schema reflections (Zod) mapped to type-safe domain models.
* **Polymorphic Provider Routing:** Decoupled platform dispatch engines implemented using an extensible **Strategy Pattern**.
* **Resilient Failure Boundaries:** Configured with an enterprise-grade exponential backoff strategy ($2\text{s} \times 2^{\text{attempt}}$) and automatic distributed lock recovery to protect against transient network faults.

---

## 📌 Table of Contents
* [System Topology & Workflow Architecture](#-system-topology--workflow-architecture)
* [Core Engineering Features](#-core-engineering-features)
* [Supported Delivery Channels](#-supported-delivery-channels)
* [Infrastructure Stack & Tech Icons](#-infrastructure-stack--tech-icons)
* [Engineering Trade-Offs & Strategic Decisions](#-engineering-trade-offs--strategic-decisions)
* [Environment Configurations (.env)](#-environment-configurations-env)
* [Step-by-Step Deployment Guide](#-step-by-step-deployment-guide)
* [Integration Testing Suites](#-integration-testing-suites)
* [Future System Roadmap](#-future-system-roadmap)
* [Author & Contribution Profile](#-author--contribution-profile)
* [License](#-license)

---

## 📐 System Topology & Workflow Architecture

The codebase cleanly separates structural business logic from external delivery mechanisms, frameworks, and infrastructure drivers.

```text
       INBOUND TRAFFIC (HTTP)
                 │
                 ▼
    ┌─────────────────────────┐
    │    Express API Host     │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────┐
    │ Tenant Verification     ├─────── [ Cache Hit (<1ms) ] ──────► [ Redis Cache ]
    │ Middleware Guardrail    ├─────── [ Cache Miss ] ────────────► [ PostgreSQL ]
    └────────────┬────────────┘                                           │
                 │ (Passed Valid UUID)                                    │
                 ▼                                                        ▼
    ┌─────────────────────────┐                                    [ Populate Cache ]
    │ NotificationController  │
    └────────────┬────────────┘
                 │ (Zod Payload Parsing)
                 ▼
    ┌─────────────────────────┐
    │ BullMQNotificationQueue │  [ Ingestion Port ]
    └────────────┬────────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Redis Queue  │  ◄─── Distributed Data State Store
         └───────┬───────┘
                 │
           (Async Poll)
                 │
                 ▼
    ┌─────────────────────────┐
    │ BullMQNotificationWorker│  [ Consumption Port ]
    └────────────┬────────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌───────────┐         ┌───────────┐
│ Postgres  │         │ Strategy  │
│ Trace Log │         │ Context   │
└───────────┘         └─────┬─────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │   Slack   │   │ Telegram  │   │   Email   │
      │ Strategy  │   │ Strategy  │   │ Strategy  │
      └───────────┘   └───────────┘   └───────────┘

```
![System Topology Architecture](./assets/architecture.png)
```mermaid
sequenceDiagram
    autonumber
    Client->>Express API: POST /api/v1/notifications/send (with x-tenant-id)
    Express API->>Redis: Query Cache-Aside Tenant Status
    Note over Redis, Postgres: If Cache Miss, verify via Postgres & cache result
    Express API->>Zod: Validate Payload Structure
    Express API->>BullMQ Queue: Enqueue Job Data
    BullMQ Queue-->>Client: 202 Accepted (Connection Released)
    
    loop Worker Polling
        BullMQ Worker->>BullMQ Queue: Pull Active Job (Atomic Lua Lock)
        BullMQ Worker->>Postgres: Create Log (Status: PROCESSING)
        BullMQ Worker->>Strategy Context: Route to Channel (Slack/Telegram)
        Strategy Context->>Third Party API: Deliver Outbound Network Request
        Alt Success
            BullMQ Worker->>Postgres: Update Log (Status: DELIVERED)
        Else Network Failure
            BullMQ Worker->>Postgres: Update Log (Status: FAILED) + Trigger Exponential Backoff
        End
    end

```mermaid
graph TD
    %% Styling Definitions
    classDef client fill:#eceff1,stroke:#37474f,stroke-width:2px;
    classDef layer fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef storage fill:#efebe9,stroke:#5d4037,stroke-width:2px;
    classDef external fill:#f1f8e9,stroke:#558b2f,stroke-width:2px;

    %% Nodes
    Inbound["Inbound Traffic (HTTP POST)"]:::client
    Middleware["Tenant Verification Middleware<br/>(Cache-Aside Guardrail)"]:::layer
    Controller["Notification Controller<br/>(Zod Schema Parsing)"]:::layer
    Queue["BullMQ Ingestion Queue<br/>(Producer Port)"]:::layer
    
    RedisCache[("Redis Cache<br/>(Tenant Status Status)")]:::storage
    PostgresDB[("PostgreSQL Database<br/>(Registry & Trace Logs)")]:::storage
    RedisQueue[("Redis Memory Buffer<br/>(BullMQ Job Store)")]:::storage

    Worker["BullMQ Background Worker<br/>(Consumer Port)"]:::layer
    Strategy["Strategy Context Routing Engine"]:::layer
    
    Slack["Slack Webhook Gateway"]:::external
    Telegram["Telegram Bot API"]:::external
    Email["SMTP Server (Planned)"]:::external

    %% Connections
    Inbound --> Middleware
    Middleware -- "1. Fast Look-up" --> RedisCache
    Middleware -- "2. DB Fallback / Miss" --> PostgresDB
    Middleware -->|"Passed Valid UUID"| Controller
    Controller --> Queue
    Queue -->|"Atomically Enqueue Job"| RedisQueue
    
    RedisQueue -.->|"Async Worker Poll"| Worker
    Worker -->|"Write State PROCESSING"| PostgresDB
    Worker --> Strategy
    Strategy --> Slack
    Strategy --> Telegram
    Strategy --> Email

    %% Apply Classes
    class Inbound client;
    class Middleware,Controller,Queue,Worker,Strategy layer;
    class RedisCache,PostgresDB,RedisQueue storage;
    class Slack,Telegram,Email external;


### End-to-End Execution Trace

1. **Perimeter Defense:** The incoming request is intercepted by the `validateTenant` middleware. The engine queries the local **Redis** instance first. On a cache miss, it validates structural authenticity against the **PostgreSQL** Registry Table, gracefully caching valid schemas with an explicit 1-hour Time-To-Live (TTL).
2. **Structural Validation:** The request body hits the application domain controller where it undergoes runtime type-parsing via a comprehensive Zod validator schema.
3. **Decoupled Ingestion:** Validated entities are marshaled into the asynchronous buffer pipeline. The adapter issues a fast command to Redis over TCP port `6379`. The HTTP controller immediately releases the caller connection with a `202 Accepted` status code.
4. **Queue Processing:** Running on isolated execution loops, background consumer threads pull job data atomically using distributed Redis Lua lock scripts to prevent duplicate delivery tasks.
5. **State Tracking:** The worker writes an initial `PROCESSING` log row entry into PostgreSQL.
6. **Strategy Dispatch:** The engine resolves the context strategy matching the requested message channel (`SLACK`, `TELEGRAM`) and sends the network request to the third-party gateway API.
7. **Final Settlement:** If successful, the database trace log transitions to `DELIVERED`. If it fails, the worker logs `FAILED` along with the network exception stack trace, triggering automatic exponential retry schedules.

---

## 🏁 Core Engineering Features

* **Asynchronous Execution Model:** Distributed worker pools handle heavy third-party networking tasks independent of the user-facing web server.
* **Granular Multi-Tenancy:** Secure tenant separation layer ensures no client data can bleed into neighboring logs or operations.
* **Extensible Architecture:** Adding a new communication platform (e.g., Discord or Twilio SMS) requires writing a single subclass strategy without changing the core engine.
* **Fault-Tolerant Retries:** Built-in resilience backing loops execute custom exponential fallback timers ($2\text{s} \times 2^{\text{attempt}}$) to handle temporary downstream network breaks cleanly.

---

## 📡 Supported Delivery Channels

| Channel | Protocol | Security Mechanism | Status | Target Use Case |
| --- | --- | --- | --- | --- |
| **Slack Webhooks** | HTTPS POST | Cryptographic Tokens | `ONLINE` | Corporate alerts & DevOps pipeline events |
| **Telegram Bot API** | HTTPS JSON | Bot Authentication Tokens | `ONLINE` | Consumer messaging & real-time chat updates |
| **SMTP / Email** | TLS Mail | OAuth2 / Secure Passwords | `PLANNED` | Traditional transaction confirmations & invoices |

---

## 🛠️ Infrastructure Stack Matrix

* **Runtime Runtime Engine:** Node.js (v20+ LTS) with TypeScript (`tsx` compiler output).
* **Web Framework Node:** Express.js (Clean, framework-agnostic architectural mapping).
* **Queue Orchestration Layer:** BullMQ (Distributed memory management client).
* **Persistence & Metric Logging Store:** PostgreSQL 15 (Relational storage, strict schema index execution constraints).
* **Asynchronous Broker Core:** Redis 7 (In-memory structured storage engine).
* **Container Runtime Layer:** Docker & Docker Compose.

---

## ⚖️ Engineering Trade-Offs & Strategic Decisions

### 1. Architectural Style: Node.js/BullMQ Library vs. Dedicated RabbitMQ Broker

* **Decision:** We chose an application-level library wrapper (BullMQ) running over Redis rather than installing a standalone message broker like RabbitMQ.
* **Trade-off Analysis:** While RabbitMQ delivers highly complex native message routing rules out of the box, it requires maintaining a distinct, resource-heavy Erlang environment. BullMQ handles delivery states cleanly through atomic Lua operations directly inside Redis. Since Redis was already chosen for our low-latency caching layers, this decision eliminated infrastructure bloat, kept the deployment lightweight, and leveraged sub-millisecond in-memory data processing operations.

### 2. Transaction Flow: Fast Ingestion over Direct Real-Time Deliveries

* **Decision:** The platform trades instant visibility into external message dispatch statuses for unthrottled ingestion availability by responding with a `202 Accepted` status.
* **Trade-off Analysis:** If the API directly waited for external APIs (like Slack or Telegram) to respond before completing the client's request, execution would lock up under heavy traffic spikes. If third-party networks went down or slowed down, our backend would experience thread pools stalling and out-of-memory crashes. Pushing requests into Redis allows us to isolate our system boundaries from downstream network dependencies. Client verification applications can simply query the database transaction tracking logs asynchronously using the generated message ID.

### 3. Database Strategy: Decoupled Log Tables vs. Foreign Key Constraints

* **Decision:** The `tenant_id` column inside the `notification_logs` table stores the raw tenant tracking identifier directly without enforcing a strict database-level `FOREIGN KEY` reference constraint back to the main `tenants` registration table.
* **Trade-off Analysis:** This prevents the background logging worker from locking database tables during heavy throughput spikes. We enforce strict data verification upstream at the API gateway layer via our validation middleware, allowing the write-heavy background database logs to write data continuously at scale without query bottlenecks.

---

## ⚙️ Environment Variables Config File (`.env`)

Create a `.env` configuration file in your project root directory:

```env
PORT=3000
NODE_ENV=development

# Redis Infrastructure Configuration
REDIS_HOST=notification_redis
REDIS_PORT=6379

# PostgreSQL Database Configuration
DB_HOST=notification_postgres
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=notifications_db
DB_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@notification_postgres:5432/notifications_db

```

---

## 🚀 Step-by-Step Production Deployment Guide

### Prerequisites

* Docker & Docker Compose installed on your host machine.
* A terminal interface client (e.g., `curl`).

### 1. Build and Initialize the Infrastructure

Run the following terminal command to clean the active volume mounts, build the system dependencies, and launch your isolated container cluster:

```bash
# Tear down stale cache components along with associated volume mappings
docker compose down -v

# Recompile the TypeScript application codebase and spin up the containers
docker compose up --build

```

### 2. Verify Your Services are Running

Ensure that all three core services show a healthy status in your container logs:

```text
Container notification_redis Healthy
Container notification_postgres Healthy
[System] Background BullMQ worker initialized successfully.
[System] Multi-Tenant Notification Core running on port 3000

```

---

## 🧪 Integration Testing Guide

### 1. Testing a Valid Tenant Request (Cache-Aside Path)

Send a POST request using the valid, pre-seeded tenant UUID (`00000000-0000-0000-0000-000000000001`):

```bash
curl -X POST http://localhost:3000/api/v1/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "channel": "SLACK",
    "recipient": "https://hooks.slack.com/services/YOUR_WORKSPACE/YOUR_CHANNEL/YOUR_SECRET_TOKEN",
    "content": "*System Alert:* Core notification execution engine successfully operational."
  }'

```

#### Expected Terminal Log Output:

```text
notification_api_core | Enqueued job dispatch:SLACK:00000000-0000-0000-0000-000000000001
notification_api_core | [Worker] Processing job 1 for Tenant: 00000000-0000-0000-0000-000000000001 via SLACK

```

### 2. Testing the Boundary Guardrail (Invalid Tenant Path)

Send a request using an unlisted or malformed tenant ID to verify that the security perimeter blocks unauthorized traffic:

```bash
curl -X POST http://localhost:3000/api/v1/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 99999999-9999-9999-9999-999999999999" \
  -d '{
    "channel": "TELEGRAM",
    "recipient": "123456789",
    "content": "Malicious payload attempt."
  }'

```

#### Expected HTTP Client Response:

```json
{
  "status": "fail",
  "message": "Unauthorized access. Provided Tenant ID is not registered."
}

```

## 🔮 Future System Roadmap

* [ ] **Dynamic Webhook Rate-Limiting:** Build an active throttle array inside the Redis cache mapping window rules per tenant layer to prevent downstream provider bans.
* [ ] **Dead Letter Queue (DLQ) Traps:** Add a secure secondary routing queue to safely hold and dump jobs that exhaust all 5 backoff retries for deep analysis.
* [ ] **Infrastructure Evolution:** Rewrite the core high-throughput gateway proxy and load balancer in **Go** to maximize packet-forwarding speeds and optimize memory allocation.

---

## 👨‍💻 Author & Contribution Profile

**Osazuwa Matthew Ogbebor** *Lead Backend & Systems Software Engineer* * Specialized in high-scale, fault-tolerant distributed runtime architectures, advanced automation pipelines, and robust systems engineering paradigms.

* **GitHub:** [@OsazuwaOgbebor](https://github.com/osazuwamatthewogbebor)
<!-- * 💼 **Upwork:** [Specialized Go & Node.js Engineering Catalog](https://www.google.com/search?q=https://www.upwork.com) -->

---

## 📄 License

This software is distributed under the **MIT License**. Check out the `LICENSE` script configuration files for terms regarding open-source contribution setups.