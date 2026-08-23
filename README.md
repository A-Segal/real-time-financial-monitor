# Real-Time Financial Monitor

A real-time transaction monitoring application with support for multiple backend instances via a Redis SignalR backplane.

## Architecture

```
Client A → Backend Instance 1 → SQLite (own DB)
               ↓
            Redis (SignalR backplane)
               ↓
Client B → Backend Instance 2 → SQLite (own DB)
```

### Components

- **Server:** ASP.NET Core 8 Web API with SignalR for real-time push notifications
- **Client:** React 19 + TypeScript + Vite, using `@microsoft/signalr` for real-time events
- **Database:** Each backend instance has its own SQLite database (no shared storage)
- **Backplane:** Redis used exclusively for SignalR cross-instance event propagation

### SignalR Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `TransactionCreated` | POST /api/transactions | `{ transactionId, amount, currency, status, timestamp }` |
| `TransactionStatusUpdated` | PUT /api/transactions/{id}/status | `(transactionId, status)` |

## Prerequisites

- .NET 8 SDK
- Node.js 20+
- Docker (for running Redis locally)

## Getting Started

### 1. Start Redis

```bash
docker compose -f docker-compose.yml up -d
```

This starts Redis on `127.0.0.1:6379` with no password.

### 2. Start the Backend (single instance)

```bash
cd server/FinancialMonitor.Api/FinancialMonitor.Api
dotnet run
```

The API is available at `http://127.0.0.1:5120`.

### 3. Start the Client

```bash
cd client
npm install
npm run dev
```

The client is available at `http://127.0.0.1:5174`.

### 4. Running Multiple Backend Instances

Open two terminals:

**Terminal 1 (port 5120):**
```bash
cd server/FinancialMonitor.Api/FinancialMonitor.Api
dotnet run --urls http://127.0.0.1:5120
```

**Terminal 2 (port 5121):**
```bash
cd server/FinancialMonitor.Api/FinancialMonitor.Api
ASPNETCORE_URLS=http://127.0.0.1:5121 dotnet run
```

Both instances share the same Redis instance. The development configuration in `appsettings.Development.json` already points to `127.0.0.1:6379`.

### 5. Redis Configuration

Set the `Redis:ConnectionString` configuration value in one of these ways:

- **appsettings.json** (default, empty = no Redis backplane):
  ```json
  "Redis": {
    "ConnectionString": ""
  }
  ```

- **appsettings.Development.json** (local development):
  ```json
  "Redis": {
    "ConnectionString": "127.0.0.1:6379"
  }
  ```

- **Environment variable:**
  ```bash
  set Redis:ConnectionString=127.0.0.1:6379
  ```

When `Redis:ConnectionString` is empty or null, SignalR runs without a backplane (single-instance mode).

### 6. Redis Not Available Behavior

If Redis is configured but not reachable, the application will fail at startup with a `RedisConnectionException`. This is intentional — silently falling back to a non-distributed mode when a Redis backplane is expected would lead to incorrect behavior in a multi-instance deployment.

## Running Tests

### Backend Tests

```bash
# Unit tests (no Redis required)
dotnet test tests/FinancialMonitor.Api.Tests/FinancialMonitor.Api.Tests.csproj

# Integration tests (no Redis required; filter out Redis tests)
dotnet test tests/FinancialMonitor.Api.IntegrationTests/FinancialMonitor.Api.IntegrationTests.csproj --filter "FullyQualifiedName!~RedisBackplane"

# Redis backplane integration tests (Redis required)
dotnet test tests/FinancialMonitor.Api.IntegrationTests/FinancialMonitor.Api.IntegrationTests.csproj --filter "FullyQualifiedName~RedisBackplane"
```

### Client Tests

```bash
cd client
npm test
npm run build
npm run lint
```

### E2E Tests

```bash
npm --prefix client run test:e2e
```

## Redis Backplane Integration Tests

The tests in `RedisBackplaneIntegrationTests.cs` verify:

- TransactionCreated propagates across two backend instances via Redis
- TransactionStatusUpdated propagates across two backend instances via Redis
- Both clients on different backends receive the same event
- No duplicate events are produced because of Redis
- Transaction data stays in SQLite, not in Redis
- Pending-only status transition rule is still enforced
- SignalR works correctly without Redis configuration

**Prerequisite:** These tests require a running Redis instance on `127.0.0.1:6379`.
Start it with: `docker compose -f docker-compose.yml up -d`

## Project Structure

```
real-time-financial-monitor/
├── docker-compose.yml              # Local Redis for development
├── server/
│   └── FinancialMonitor.Api/
│       ├── FinancialMonitor.Api.sln
│       └── FinancialMonitor.Api/
│           ├── Program.cs           # Entry point with Redis-aware SignalR setup
│           ├── Controllers/
│           ├── Services/            # TransactionService with SignalR events
│           ├── Repositories/        # SQLite-backed repository
│           ├── Hubs/
│           │   └── TransactionHub.cs
│           ├── Models/
│           ├── Data/
│           │   └── AppDbContext.cs
│           ├── DTOs/
│           ├── appsettings.json
│           └── appsettings.Development.json
├── client/
│   └── src/
│       ├── api/
│       │   ├── transactionsApi.ts   # HTTP API client
│       │   └── transactionsHub.ts   # SignalR hub client
│       ├── hooks/
│       └── pages/
└── tests/
    ├── FinancialMonitor.Api.Tests/
    ├── FinancialMonitor.Api.IntegrationTests/
    ├── FinancialMonitor.Client.Tests/
    └── FinancialMonitor.E2E/
```
