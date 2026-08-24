# Real-Time Financial Monitor

A real-time transaction monitoring application with a scalable multi-instance backend, Redis SignalR backplane, and Docker Compose orchestration.

## Architecture

```
                    ┌─────────────┐
                    │   Browser   │
                    │  (React SPA)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Frontend  │
                    │  (nginx)    │  Port 5174
                    │  SPA only   │
                    └─────────────┘
                           │
                           │ HTTP / SignalR / WebSocket
                           │ VITE_API_URL=http://127.0.0.1:5000
                           ▼
               ┌───────────────────┐
               │  backend-lb       │
               │  (nginx reverse   │  Port 5000
               │   proxy + ip_hash)│
               └──┬────┬────┬──────┘
                  │    │    │
          ┌───────┘    │    └───────┐
          ▼            ▼            ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │ backend-1 │ │ backend-2 │ │ backend-N │
   │  (ASP.NET │ │  (ASP.NET │ │  (ASP.NET │
   │ Core 8.0) │ │ Core 8.0) │ │ Core 8.0) │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
         │             │             │
         └──────┬──────┴──────┬──────┘
                │             │
         ┌──────▼──────┐ ┌───▼────────┐
         │   Redis     │ │  SQLite    │
         │ (SignalR    │ │ (per-rep.  │
         │  backplane) │ │  instance) │
         └─────────────┘ └────────────┘
```

### Components

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 19 + TypeScript + Vite | Served by nginx; connects to load balancer |
| **Backend** | ASP.NET Core 8 Web API + SignalR | Transaction processing, real-time events |
| **Backend LB** | nginx (ip_hash) | Routes HTTP/WebSocket to backend replicas |
| **Redis** | Redis 7 (Alpine) | SignalR backplane — cross-instance event propagation |
| **Database** | SQLite (per replica) | Instance-local storage; not shared |

### How It Works

1. The **frontend** is a static React SPA served by nginx.
2. All HTTP API calls and SignalR WebSocket connections go through the **backend-lb** load balancer (localhost:5000).
3. The load balancer distributes requests to available **backend replicas** using `ip_hash` for session affinity.
4. Each backend replica has its own **SQLite** database file — data is per-instance and ephemeral in Docker.
5. All backend replicas connect to the same **Redis** instance, which propagates SignalR events across all replicas.
6. A transaction created on one backend instance is broadcast through Redis, so all connected clients receive the real-time update — regardless of which backend they're connected to.

## Prerequisites

- Docker & Docker Compose
- .NET 8 SDK (for local development outside Docker)
- Node.js 20+ (for frontend development outside Docker)

## Getting Started with Docker

### Build and Start (1 backend replica)

```bash
docker compose build --no-cache
docker compose up -d --scale backend=1
```

### Access the application

- Frontend: http://127.0.0.1:5174
- Backend API (via load balancer): http://127.0.0.1:5000
- Backend health check: http://127.0.0.1:5000/health
- Redis: 127.0.0.1:6379

### Scaling the backend

Scale to any number of backend replicas **without editing docker-compose.yml**:

```bash
# Scale to 2 replicas
docker compose up -d --scale backend=2

# Scale to 5 replicas
docker compose up -d --scale backend=5

# Scale back down to 1
docker compose up -d --scale backend=1
```

Docker Compose creates or removes backend containers automatically. The load balancer discovers new replicas via Docker DNS.

### Stopping the system

```bash
docker compose down
```

Use `docker compose down -v` to also remove the SQLite data stored in the backend container writable layers.

## Architecture Decision Records

### Why was the old backend-a/backend-b architecture replaced?

The previous architecture hard-coded exactly two backend instances (`backend-a`, `backend-b`) and two frontend instances (`frontend-a`, `frontend-b`) in docker-compose.yml, each with fixed host ports (5120, 5121, 5174, 5175). This meant:

- Changing the number of instances required editing docker-compose.yml
- The architecture couldn't scale beyond 2 without manual edits
- Frontend instances had baked-in backend instance URLs

The new architecture replaces this with:
- A single scalable `backend` service — `docker compose up -d --scale backend=N` handles any N
- A single `frontend` service pointing to the load balancer
- A `backend-lb` reverse proxy as the single backend entry point

### How Docker Compose scaling works

Docker Compose's `--scale backend=N` creates N replicas of the `backend` service. Each replica:
- Gets its own container with a unique name (`real-time-financial-monitor-backend-1`, etc.)
- Is assigned a container-private IP on the Docker network
- Is automatically registered in Docker DNS under the service name `backend`

The nginx load balancer uses `server backend:8080` in its upstream block — Docker DNS resolves `backend` to all running replica IPs, and nginx load-balances across them.

### How the load-balancing layer works

- **nginx** with `ip_hash` provides session affinity — the same client IP always hits the same backend replica.
- `/hubs/` routes get WebSocket upgrade headers — essential for SignalR connections.
- `/api/` routes receive HTTP proxy headers (`X-Forwarded-For`, etc.).
- Passive health checks (`max_fails=3`, `fail_timeout=10s`) mark unresponsive backends as down.

Session affinity (`ip_hash`) is important because SignalR starts with an HTTP negotiation request and then upgrades to a WebSocket. Without affinity, the WebSocket upgrade might land on a different backend than the negotiation, breaking the connection. The Redis backplane makes affinity *unnecessary* for event delivery (all instances receive all events), but the HTTP → WebSocket upgrade process itself requires stickiness.

### Why Redis is shared between backend replicas

The Redis SignalR backplane ensures that events published on *any* backend replica are received by *all* connected clients — regardless of which backend replica they're connected to. Without this shared backplane, clients connected to backend-1 would not see transactions created via backend-2.

Each backend replica connects to the same Redis instance using the Docker Compose service name (`redis:6379`).

### Why SQLite remains an MVP/local-storage solution

SQLite is an embedded, file-based database that cannot be safely shared across multiple processes. In the current Docker setup, each backend replica creates its own SQLite file in the container's writable layer. This means:

- ✅ Each replica has its own database — no file-locking conflicts
- ❌ Data created on one replica is not visible to other replicas (SQLite "isolation" is data loss, not intentional partitioning)
- ❌ Data is lost when the container is removed (no Docker named volume)

For local development and testing of the Redis backplane behavior, this is acceptable. A production deployment would use a shared database (PostgreSQL, SQL Server, etc.) that all replicas connect to.

### Future: Kubernetes deployment (NOT implemented yet)

The current Docker Compose setup is a local development/testing environment. A future Kubernetes deployment would:

- Replace Docker Compose with Kubernetes manifests
- Use a Kubernetes Service or Ingress for load balancing (instead of the nginx `backend-lb` container)
- Replace per-replica SQLite with a shared production database (PostgreSQL, SQL Server)
- Keep the Redis SignalR backplane for real-time event propagation
- Use Kubernetes Deployments with `replicas:` for scaling (instead of `--scale`)
- Keep the same frontend Docker image (already K8s-ready — VITE_API_URL is runtime-configurable)

## Development (Outside Docker)

### 1. Start Redis (required for multi-instance testing)

```bash
docker compose up -d redis
```

### 2. Start the Backend

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

### 4. Running Multiple Backend Instances (for manual testing)

```bash
cd server/FinancialMonitor.Api/FinancialMonitor.Api

# Terminal 1
dotnet run --urls http://127.0.0.1:5120

# Terminal 2
ASPNETCORE_URLS=http://127.0.0.1:5121 dotnet run
```

Both instances share the same Redis instance. The development configuration in `appsettings.Development.json` already points to `127.0.0.1:6379`.

## SignalR Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `TransactionCreated` | POST /api/transactions | `{ transactionId, amount, currency, status, timestamp }` |
| `TransactionStatusUpdated` | PUT /api/transactions/{id}/status | `(transactionId, status)` |

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

## Project Structure

```
real-time-financial-monitor/
├── docker-compose.yml           # Scalable Docker Compose setup
├── loadbalancer/
│   ├── Dockerfile               # nginx load-balancer image
│   └── nginx.conf               # nginx config with ip_hash + WebSocket proxy
├── server/
│   └── FinancialMonitor.Api/
│       ├── FinancialMonitor.Api.sln
│       └── FinancialMonitor.Api/
│           ├── Program.cs       # Entry point with health endpoint
│           ├── Controllers/
│           ├── Services/        # TransactionService with SignalR events
│           ├── Repositories/    # SQLite-backed repository
│           ├── Hubs/
│           │   └── TransactionHub.cs
│           ├── Models/
│           ├── Data/
│           │   └── AppDbContext.cs
│           ├── DTOs/
│           ├── appsettings.json
│           └── appsettings.Development.json
├── client/
│   ├── Dockerfile               # Frontend image (runtime config injection)
│   ├── docker-entrypoint.sh     # Generates config.js from env vars at runtime
│   ├── nginx/
│   │   └── default.conf         # Frontend nginx config
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
