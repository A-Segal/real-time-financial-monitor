# Implementation Plan — Real-Time Financial Monitor

**Assessment:** Mid-Level Full Stack
**Stack:** ASP.NET Core 8 (C#) + EF Core + SQLite, with a client built later, SignalR for real-time, and tests.
**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

This plan is written to be updated with checkboxes as work progresses. Each phase depends on the phases above it. The **core MVP** (Domain → Repository) is Phase 1–4. Real-time, tests, frontend, distributed infrastructure, and deployment are deliberately layered **after** the MVP so the foundation is solid before adding complexity.

---

## Phase 1 — Domain Model

The single source of truth for what a transaction *is*. No framework dependencies live here — only the entity and its invariant states.

- [x] `Transaction` entity in `Models/Transaction.cs`
  - [x] `Guid transactionId` — primary key, uniquely identifies a transaction
  - [x] `decimal amount` — monetary value of the transaction
  - [x] `string currency` — ISO 4217 currency code (e.g. `USD`, `EUR`, `ILS`); **data type: `string`** to avoid `char(3)` noise and preserve a stable, readable, normalized format
  - [x] `TransactionStatus status` — current state (enum, below)
  - [x] `DateTime timestamp` — when the transaction occurred (UTC)
- [x] `TransactionStatus` enum in `Models/Transaction.cs`
  - [x] `Pending` — received, not yet settled
  - [x] `Completed` — processed successfully
  - [x] `Failed` — could not be processed
- [ ] Entity constraints and data types reviewed against the provider:
  - [ ] `decimal` requires a `Precision`/`Scale` configuration for SQLite, or it is normalized by EF Core's value conversion — confirm the stored precision is appropriate for monetary values
  - [ ] `DateTime timestamp` — confirmed stored/converted as UTC consistently (read as UTC on the way back out)

> **Why a dedicated domain model?** The entity is the persistence contract with the database. It is intentionally kept separate from what the API exposes to clients (see Phase 2) so database shape and API shape can evolve independently.

---

## Phase 2 — DTO Layer

Request/response objects define the **API contract** — what a client may send and what it receives. They are deliberately distinct from the persistence model.

- [x] `CreateTransactionRequest` in `DTOs/`
  - [ ] Bind `amount`, `currency` from the client request body
  - [ ] Include the fields a client must supply to create a transaction
- [x] `TransactionResponse` in `DTOs/`
  - [ ] Exposes `transactionId`, `amount`, `currency`, `status`, `timestamp` back to the client
  - [ ] Optionally mirrors the entity's fields but is its own type so API shape is not coupled to the entity
- [x] `UpdateTransactionStatusRequest` in `DTOs/`
  - [ ] Carries the new `status` value from the client for a status-update operation
- [ ] Mapping between entity ⇄ DTO (manual mapping or a lightweight mapper) wired into the Service/Controller layer

> **Why separate API contracts from persistence models?** Persisting a table shape and exposing an API are two different trust boundaries:
> - The **entity** represents the database schema and internal invariants (e.g. how `decimal` is stored).
> - The **DTO** represents what we agree to receive from and return to clients.
> Changing the schema must not break the public API, and evolving the API must not force a migration. They diverge freely.

---

## Phase 3 — Persistence

How transactions are stored and retrieved.

- [x] **SQLite** — lightweight, file-based relational store; zero external services to provision, ideal for an MVP that must run locally
- [x] **EF Core** — ORM over the `Transactions` table; gives async, change-tracking, and migrations
- [x] `AppDbContext` in `Data/AppDbContext.cs`
  - [x] Exposes `DbSet<Transaction> Transactions`
  - [x] Constructor accepts `DbContextOptions<AppDbContext>`
- [ ] Configuration
  - [x] `UseSqlite` registered in `Program.cs` from connection string `DefaultConnection`
  - [ ] Connection string present in `appsettings.json` (and a dev override in `appsettings.Development.json`)
- [x] Migrations
  - [x] Initial migration created (`20260820231444_InitialCreate`)
  - [x] `financial-monitor.db` present in the project directory
- [ ] Database creation
  - [ ] Verify database is created/updated at startup (`EnsureCreated` or `Database.Migrate()`) and confirm the `Transactions` table exists with expected schema
  - [ ] Confirm the schema matches the entity: PK on `transactionId`, columns for `amount`, `currency`, `status`, `timestamp`

---

## Phase 4 — Repository Layer

The persistence boundary used by services. It isolates EF Core from the rest of the application.

- [x] `ITransactionRepository` in `Repositories/`
  - [x] `GetAllTransactionsAsync()` — returns all transactions
  - [x] `AddTransactionAsync(Transaction transaction)` — inserts a transaction
  - [x] `UpdateTransactionStatusAsync(Guid transactionId, TransactionStatus status)` — updates only the status of an existing transaction
- [x] `TransactionRepository` in `Repositories/`
  - [x] Implements `ITransactionRepository`
  - [x] Depends on `AppDbContext` (injected)
  - [x] All operations target the `Transactions` `DbSet`
  - [x] Uses async EF Core methods (`ToListAsync`, `AddAsync`, `SaveChangesAsync`)
  - [x] Uses `AsNoTracking()` on the read query (`GetAllTransactionsAsync`) — read-only, no change tracking needed
- [x] Registered in `Program.cs`: `AddScoped<ITransactionRepository, TransactionRepository>()`
- [ ] **Build verification** — `dotnet build` succeeds with 0 errors/warnings

> **Why a repository here and not the DbContext directly?** A thin repository keeps the service layer free of EF Core query machinery, gives a single named seam for persistence, and — because the controller/service depends on the *interface* — makes tests able to substitute a fake repository without a database. It is deliberately **thin**: no business validation or logic here; the repository only moves data in and out.

---

## Phase 5 — Service Layer

Orchestrates the application use-cases: receiving a request, applying rules, and persisting via the repository.

- [ ] `ITransactionService` + `TransactionService` in `Services/`
  - [ ] Depends on `ITransactionRepository` (and any additional collaborators) via constructor injection
  - [ ] `GetAllTransactionsAsync()` — returns all transactions as `TransactionResponse` DTOs
  - [ ] `AddTransactionAsync(CreateTransactionRequest)` — maps request → entity, persists via repository, returns the created `TransactionResponse`
  - [ ] `UpdateTransactionStatusAsync(Guid, UpdateTransactionStatusRequest)` — maps the status change request, persists via repository
- [ ] Register in `Program.cs`: `AddScoped<ITransactionService, TransactionService>()`

> **Why a service layer?** It holds the application logic (request validation, entity↔DTO mapping, and coordinating persistence) in one place that controllers can call. Controllers stay thin (HTTP concerns only); business rules have a home that is independent of HTTP.

---

## Phase 6 — API Controllers

Expose the use-cases over HTTP.

- [ ] `TransactionsController` (or equivalent) in `Controllers/`
  - [ ] `GET /api/transactions` → `GetAllTransactionsAsync()` → `200 OK` with list of `TransactionResponse`
  - [ ] `POST /api/transactions` → `AddTransactionAsync()` → `201 Created` (or `202 Accepted`) with the created `TransactionResponse`
  - [ ] `PATCH /api/transactions/{id}/status` (or `PUT`) → `UpdateTransactionStatusAsync()` → appropriate success code; `404 Not Found` if the transaction is unknown
  - [ ] Depends on `ITransactionService`, not the repository directly
  - [ ] Map DTOs, never persist entities directly

> **Why a separate controller layer?** This is the HTTP boundary. Keeping it free of persistence and business rules means the API surface is thin, predictable, and easy to test end-to-end with an in-memory client.

---

## Phase 7 — Real-Time Communication (SignalR)

Push transaction updates to connected clients instead of forcing polling.

- [ ] Add a SignalR `Hub` in `Hubs/` (e.g. `TransactionHub`)
  - [ ] Define the events the hub emits (e.g. `TransactionCreated`, `TransactionUpdated`)
  - [ ] Client endpoint for connecting (registered via `UseEndpoints`/`MapHub` + `AddSignalR`)
- [ ] Wire the service layer to emit hub events when a transaction is added or its status changes
  - [ ] Inject `IHubContext<TransactionHub>` where broadcasts originate

> **Why SignalR?** A financial monitor is inherently event-driven — clients subscribe to new/updated transactions. SignalR gives two-way, low-latency streaming out of the box over WebSockets, with automatic fallback, which is lighter and more appropriate than building custom polling or WebSocket plumbing. It is added **after** the MVP so the wired-up use-cases (create/update) already have a stable, testable core before broadcasting.

---

## Phase 8 — Automated Testing

Prove the core behavior works before building more surface area.

- [ ] `tests/` projects (empty directory currently staged for this)
  - [ ] **Unit tests** — service layer with a fake `ITransactionRepository`; no database required
  - [ ] **Integration tests** — repository against an in-memory/real SQLite instance, asserting CRUD + status-update behavior
  - [ ] **API tests** — controller endpoints via `WebApplicationFactory`

> **Why test at this point (after services/controllers)?** By now there is a useable, wired-up core to test. Testing earlier would only cover the repository; testing now covers the full request path. The fake-interface seam established in Phase 4 is exactly what makes the service tests cheap.

---

## Phase 9 — Frontend

Consume the API and render the live monitor.

- [ ] `client/` app (initial scaffolded directory present; content to be built)
  - [ ] Set up a framework (e.g. React with Vite, or plain JavaScript depending on chosen direction)
  - [ ] List view of transactions (table/cards) — data from `GET /api/transactions`
  - [ ] Create-transaction form — posts `CreateTransactionRequest`
  - [ ] Status-update control — sends `UpdateTransactionStatusRequest`
  - [ ] SignalR client that connects to the hub and live-updates the list on push
  - [ ] Load/error/empty states, responsive layout

> **Why the frontend last in the MVP path?** It consumes the API and the real-time channel, so it needs Phases 3, 6, and 7 stable first. Building it earlier would mean reworking UI against a changing contract.

---

## Phase 10 — Distributed Architecture / Redis

Scale beyond a single instance by moving to a shared, persistent broadcast layer.

- [ ] **Redis** to back the transport so broadcasts survive multiple server instances
  - [ ] Add Redis (e.g. via `Microsoft.Extensions.Caching.StackExchangeRedis` for caching, and `Redis` as a SignalR *backplane* via `Microsoft.AspNetCore.SignalR.StackExchangeRedis` for broadcast fan-out)
  - [ ] Note: a backplane is only required when the app runs more than one instance behind a reverse proxy. For a single-instance MVP it is optional and can be skipped without loss of functionality.

> **Why Redis, and why here?** SignalR messages by default are delivered only to clients connected to the *same* server process. In a horizontally-scaled deployment the broadcasts must be shared across instances — Redis is the standard pub/sub backplane that supports this. It is deferred until after the MVP because it adds infrastructure (a Redis server) that a single-node MVP does not yet need.

---

## Phase 11 — Docker / Kubernetes

Contain the app and describe how it runs in production.

- [ ] `server/` container
  - [ ] `Dockerfile` for the API (`dotnet publish`-based multi-stage build)
  - [ ] `.dockerignore` to keep image size low
- [ ] Compose / orchestration
  - [ ] `docker-compose.yml` (optionally) running the API + any Redis dependency for local parity with Phase 10
  - [ ] Kubernetes manifests (optional depending on whether K8s is required) — `Deployment`, `Service`, and (if applicable) `Ingress`

> **Why containers last?** They describe how an already-finished app runs. Containerizing mid-development adds harness overhead without adding product value — so this is deferred to the final delivery step, once the app, tests, and infrastructure decisions are all settled.

---
