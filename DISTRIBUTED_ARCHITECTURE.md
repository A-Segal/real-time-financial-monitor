# Distributed Architecture

## Real-Time Financial Monitor — Cross-Instance SignalR Synchronization

---

## 1. The Distributed Problem

When the backend runs as a single instance, everything is straightforward: all SignalR connections and all application state live inside the same process. A transaction created on that instance is immediately known to that instance, and the instance can push a real-time notification to every connected client.

When the backend is scaled horizontally, this breaks.

```
Client A                    Client B
   |                           |
   v                           v
Backend Pod A               Backend Pod B
   |                           |
   +--- SignalR connection     +--- SignalR connection
```

If a transaction reaches **Pod B**, Pod B knows about it. Pod B's local SignalR connections — including Client B's — receive the real-time update. But **Pod A** does not automatically know that Pod B processed a new transaction. Pod A's SignalR connections, including Client A, remain unaware.

The root cause is that each backend replica is an independent process with its own memory space. In-memory SignalR state — connection IDs, group memberships, the hub itself — is local to that process. No mechanism exists for one replica to share its SignalR state with another.

This is the fundamental distributed architecture problem: **how do we propagate real-time events across process boundaries when the system is horizontally scaled?**

---

## 2. Architectural Solution

The general solution is a **shared messaging backplane** that connects all backend replicas. When one replica broadcasts a SignalR event, the backplane ensures the event reaches every replica, not just the one that originated it.

In this project, **Redis** serves as the **SignalR Backplane**.

### Architecture Diagram

```
                         NGINX
                    Load Balancer
                         |
             +-----------+-----------+
             |           |           |
             v           v           v
         Backend 1   Backend 2   Backend 3
             |           |           |
             +-----------+-----------+
                         |
                         v
                  Redis Backplane
                         |
                         v
                    SignalR Events
```

### How It Works

1. All backend instances connect to the **same Redis instance**.
2. When **Backend 1** receives a transaction and broadcasts a SignalR event (e.g., `TransactionCreated`), the event is published to a Redis channel.
3. The `Microsoft.AspNetCore.SignalR.StackExchangeRedis` package subscribes each backend instance to the same Redis channel.
4. Redis fans out the event to **all subscribed backend instances** — including **Backend 2** and **Backend 3**.
5. Each receiving backend instance then forwards the event to its locally connected SignalR clients.

This means a client connected to **Backend 2** can receive a real-time update for a transaction that was submitted to **Backend 1**.

---

## 3. What Was Actually Implemented

The repository implements the following distributed architecture components:

| Component              | Technology / Tool                           |
| ---------------------- | ------------------------------------------- |
| Backend replicas       | ASP.NET Core 8.0 (multiple Docker containers) |
| Load balancer          | NGINX (Alpine-based, dynamic upstream discovery) |
| API routing            | Round Robin (default NGINX upstream balancing) |
| SignalR routing        | Sticky sessions via `hash $cookie_signalr_id consistent` |
| Real-time communication| SignalR (WebSocket transport)               |
| Cross-instance sync    | Redis Backplane (`StackExchange.Redis`)     |
| Container orchestration| Docker Compose                              |
| Data storage           | SQLite (shared volume, WAL mode)            |

### SignalR + Redis Configuration

The Redis backplane is configured in [Program.cs](server/FinancialMonitor.Api/FinancialMonitor.Api/Program.cs) (lines 44-57):

```csharp
var redisConnectionString = builder.Configuration["Redis:ConnectionString"];

if (!string.IsNullOrEmpty(redisConnectionString))
{
    builder.Services.AddSignalR()
        .AddStackExchangeRedis(redisConnectionString, redisOptions =>
        {
            redisOptions.Configuration.ChannelPrefix = RedisChannel.Literal("FinancialMonitor");
        });
}
else
{
    builder.Services.AddSignalR();
}
```

**Key details:**

- **Redis connection string**: Configured via the `Redis:ConnectionString` setting. In Docker Compose, this is set to `redis:6379` (the Docker Compose service name).
- **Channel prefix**: `"FinancialMonitor"` — all SignalR messages are published to Redis channels prefixed with this value, isolating them from any other applications sharing the same Redis instance.
- **Conditional activation**: If the Redis connection string is empty or null (as in the default `appsettings.json`), SignalR runs without the backplane. This allows single-instance development without Redis.

### Redis Connection Configuration (Docker Compose)

From [docker-compose.yml](docker-compose.yml):

```yaml
backend:
  environment:
    - Redis__ConnectionString=redis:6379
  depends_on:
    redis:
      condition: service_healthy

redis:
  image: redis:7-alpine
  container_name: financial-monitor-redis
  ports:
    - "127.0.0.1:6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 5
```

### Package Reference

From [FinancialMonitor.Api.csproj](server/FinancialMonitor.Api/FinancialMonitor.Api/FinancialMonitor.Api.csproj):

```xml
<PackageReference Include="Microsoft.AspNetCore.SignalR.StackExchangeRedis" Version="8.0.*" />
```

### SignalR Hub

The hub itself ([TransactionHub.cs](server/FinancialMonitor.Api/FinancialMonitor.Api/Hubs/TransactionHub.cs)) is intentionally minimal — it inherits from `Hub` with no custom methods. All the logic lives in the service layer:

```csharp
public class TransactionHub : Hub
{
}
```

The service ([TransactionService.cs](server/FinancialMonitor.Api/FinancialMonitor.Api/Services/TransactionService.cs)) broadcasts events via `IHubContext<TransactionHub>`:

```csharp
// After creating a transaction:
await _hubContext.Clients.All.SendAsync("TransactionCreated", ToCreatedPayload(transaction));

// After updating a transaction status:
await _hubContext.Clients.All.SendAsync(
    "TransactionStatusUpdated",
    transactionId,
    request.Status.ToString());
```

These broadcasts are intercepted by the Redis backplane and propagated to all backend instances.

---

## 4. Sticky Sessions

Sticky sessions and the Redis backplane serve two distinct purposes that complement each other.

### Sticky Sessions — Which backend handles this client's requests?

NGINX uses the `hash $cookie_signalr_id consistent` directive to route a client to the same backend instance consistently. This is configured in the `backend_signalr` upstream pool.

From the [generated NGINX config](loadbalancer/entrypoint.sh):

```nginx
upstream backend_signalr {
    hash $cookie_signalr_id consistent;
    server 172.x.x.1:8080;
    server 172.x.x.2:8080;
    server 172.x.x.3:8080;
}
```

The `signalr_id` cookie is set by the client (the SPA) **before** the SignalR connection is established. From [transactionsHub.ts](client/src/api/transactionsHub.ts):

```typescript
const SIGNALR_ID_COOKIE = 'signalr_id'

function ensureStickyCookie(): string {
  let id = getSignalrIdCookie()
  if (!id) {
    id = generateClientId()
    document.cookie =
      `${SIGNALR_ID_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax;` +
      (window.location.protocol === 'https:' ? ' Secure;' : '')
  }
  return id
}
```

The cookie is set with `path=/` so it accompanies every request to the backend — including the very first SignalR `/negotiate` request. This ensures that NGINX consistently routes the client to the same backend replica.

### Redis Backplane — How do backend instances share SignalR events?

Redis provides a pub/sub mechanism that allows all backend replicas to subscribe to the same Redis channels. When one replica publishes a SignalR event, Redis delivers it to all other replicas. This decouples the event source from the event destination.

### Why Both Are Needed

- **Sticky sessions alone are insufficient**: A client is always routed to the same backend instance, but what about a *different* client connected to a *different* backend instance? Without Redis, Client B could create a transaction on Backend 2, and Client A (on Backend 1) would never know about it.
- **Redis alone is insufficient**: Redis fan-out happens after the event is published. NGINX must still decide which backend instance receives the initial connection. Without sticky sessions, a client could be bounced between instances during a SignalR reconnect, breaking the real-time channel.
- **Together they solve the problem**: Sticky sessions ensure stable client-to-instance mapping; Redis ensures events cross instance boundaries.

---

## 5. Example Scenario

A concrete walkthrough of a cross-instance transaction flow:

### Initial State

```
Client A                                         Client B
   |                                                |
   v                                                v
NGINX                                            NGINX
   |                                                |
   v                                                v
Backend 1                                       Backend 2
   |                                                |
   |  SignalR connection (WebSocket)                |  SignalR connection (WebSocket)
   |                                                |
Client A                                        Client B
```

### Transaction Flow

```
1. Client B submits a new transaction (POST /api/transactions)
2. NGINX routes the request to Backend 2 (Round Robin — this is API traffic)
3. Backend 2 validates and persists the transaction to SQLite
4. Backend 2 broadcasts "TransactionCreated" via SignalR hub
5. The Redis backplane intercepts the broadcast and publishes it to Redis channels prefixed with "FinancialMonitor"
6. Redis fans out the message to Backend 1 and Backend 3 (both subscribed to the same channel)
7. Backend 1 receives the "TransactionCreated" event from Redis
8. Backend 1 forwards the event to its locally connected SignalR client: Client A
9. Backend 2 also receives the event back from Redis (duplicate prevention is built into the backplane library) and forwards it to Client B
10. Both Client A and Client B see the new transaction in real-time
```

### Technical Summary

| Step | Actor | Action |
|------|-------|--------|
| 1 | Client B | Sends HTTP POST to create transaction |
| 2 | NGINX | Routes to Backend 2 via Round Robin |
| 3 | Backend 2 | Persists transaction to SQLite |
| 4 | Backend 2 | Calls `Clients.All.SendAsync("TransactionCreated", ...)` |
| 5 | Redis Backplane | Publishes event to Redis channel `FinancialMonitor:{HubType}:TransactionCreated` |
| 6 | Redis | Fans out to all subscribed backend instances |
| 7 | Backend 1 | Receives event from Redis subscription |
| 8 | Backend 1 | Forwards to locally connected Client A |
| 9 | Backend 2 | Also receives event from Redis (suppressed duplication) and forwards to Client B |
| 10 | Client A, Client B | Both display the new transaction in real-time |

---

## 6. Verification

The following verification has been performed and is documented in the repository.

### Multiple Replicas

The application was scaled using Docker Compose:

```powershell
docker compose up -d --scale backend=3
```

Three backend containers were started and registered under the Docker Compose service name `backend`. The NGINX load balancer's startup script (`entrypoint.sh`) dynamically discovers all backend IPs via Docker DNS (`nslookup backend 127.0.0.11`) and generates upstream blocks with one server entry per unique IP.

### Round Robin Distribution

The `/health` endpoint was tested by sending repeated requests. Each response includes the `instance` field:

```json
{
  "status": "Healthy",
  "instance": "hostname-of-container"
}
```

The `X-Backend-Instance` response header (added by middleware in `Program.cs`) also identifies which backend replica handled the request. Different instance values were observed across requests, confirming that NGINX distributes requests across replicas.

### Sticky Sessions

The `/sticky-test` endpoint was tested by sending requests with a `signalr_id` cookie:

```text
Cookie: signalr_id=test-client-123
```

Repeated requests with the same cookie value consistently returned the same `instance` value, confirming that NGINX's `hash $cookie_signalr_id consistent` directive routes the client to the same backend replica.

### Redis Connectivity

Redis connectivity was verified with:

```powershell
docker compose exec redis redis-cli ping
```

Expected response: `PONG`

### Real-Time Synchronization (Verified by Integration Tests)

The repository includes **integration tests** in [RedisBackplaneIntegrationTests.cs](tests/FinancialMonitor.Api.IntegrationTests/SignalR/RedisBackplaneIntegrationTests.cs) that prove cross-instance event propagation through Redis.

**Test methodology:**

1. Two `WebApplicationFactory<Program>` instances are booted (simulating two backend replicas).
2. Each factory uses its own isolated in-memory SQLite database.
3. Both factories connect to the same real Redis instance at `127.0.0.1:6379`.
4. A `HubConnection` is established to each backend instance.

**Tests that pass:**

| Test | What It Proves |
|------|---------------|
| `TransactionCreated_OnInstanceA_PropagatesViaRedisToClientB` | Creating a transaction on Backend A causes Client B (connected to Backend B) to receive a `TransactionCreated` event |
| `TransactionCreated_OnInstanceA_PropagatesViaRedisToClientAAndB` | Both clients — connected to different backends — receive the same event when a transaction is created |
| `TransactionStatusUpdated_OnInstanceA_PropagatesViaRedisToClientB` | Updating a transaction's status on Backend A causes Client B (on Backend B) to receive a `TransactionStatusUpdated` event |
| `TransactionCreated_WithRedisBackplane_EmitsExactlyOneEvent` | The Redis backplane does **not** cause duplicate events on the originating instance |
| `TransactionData_RemainsInSqlite_NotInRedis` | Transaction data persists in SQLite only, **not** in Redis (Redis is used for signaling, not storage) |
| `PendingOnlyStatusTransition_StillEnforced_WithRedisBackplane` | Business logic enforcement (pending-only status transitions) works correctly with the backplane enabled |
| `WithoutRedisConfiguration_SignalRWorksAsNormal` | When Redis is not configured, SignalR falls back gracefully to in-process operation |

---

## 7. Scaling to 5 Replicas

The same architecture extends directly from 3 replicas to 5 replicas without any fundamental changes.

### Architecture at 5 Replicas

```
                       NGINX
                         |
       +------+------+------+------+------+
       |      |      |      |      |
       v      v      v      v      v
     Pod 1  Pod 2  Pod 3  Pod 4  Pod 5
       |      |      |      |      |
       +------+------+------+------+
                      |
                      v
              Redis Backplane
```

### What Changes

| Aspect | At 3 Replicas | At 5 Replicas |
|--------|---------------|---------------|
| NGINX upstream entries | 3 server entries | 5 server entries |
| Backend containers | 3 `docker compose up -d --scale backend=3` | 5 `docker compose up -d --scale backend=5` |
| Redis backplane connections | 3 connections | 5 connections |
| SignalR subscribers | 3 instances | 5 instances |

### What Stays the Same

- **NGINX configuration** — The `entrypoint.sh` script dynamically discovers backend IPs via Docker DNS. It automatically generates the correct number of upstream server entries regardless of the scale factor. No manual configuration changes are needed.
- **Redis configuration** — All replicas connect to the same Redis instance using the same connection string (`redis:6379`). The same channel prefix (`FinancialMonitor`) is used.
- **Sticky session configuration** — The `hash $cookie_signalr_id consistent` directive requires no changes. Clients are consistently routed to their assigned backend regardless of the pool size.
- **SignalR hub configuration** — The hub code and service logic are unchanged. `Clients.All.SendAsync` continues to work because the backplane transparently handles distribution.

### Command to Scale

```powershell
docker compose up -d --scale backend=5
```

The NGINX load balancer's background watcher (in `entrypoint.sh`) detects the new IPs within 10 seconds and reloads the configuration:

```
[entrypoint] Backend IPs changed: '172.x.x.1 172.x.x.2 172.x.x.3' -> '172.x.x.1 172.x.x.2 172.x.x.3 172.x.x.4 172.x.x.5'
[entrypoint] Regenerating config and reloading nginx...
```

### Practical Limits

The architecture supports scaling to at least 5 replicas without modification. In a production Kubernetes deployment, the same principles apply:

- **NGINX Ingress Controller** replaces the custom NGINX container, with Ingress annotations for sticky sessions.
- **Redis** can be clustered for high availability (Redis Sentinel or Redis Cluster).
- **SQLite** must be replaced with a shared database (PostgreSQL, SQL Server) to avoid the single-writer bottleneck of a shared file volume.

---

## 8. Architectural Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **NGINX** | Load balancing and sticky routing — distributes incoming requests across backend replicas using Round Robin (API) and `hash $cookie_signalr_id consistent` (SignalR) |
| **Backend replicas** | API request processing and SignalR connection management — each replica independently handles HTTP requests and maintains its own set of WebSocket connections |
| **SignalR** | Real-time communication with connected clients — provides the pub/sub abstraction (`Clients.All.SendAsync`) that the application code uses to push events |
| **Redis** | Cross-instance SignalR synchronization — acts as the message backplane, receiving events from one backend instance and distributing them to all others |
| **SQLite** | Transaction data persistence — stores transaction records in a shared volume with WAL mode for concurrent read access |

---

## 9. Assessment Mapping

This implementation directly addresses the Mid Full Stack Assessment requirement:

> *"If we deploy this backend to 5 different pods (replicas), a client connected to Pod A won't see data sent to Pod B."*

### The Challenge

Multiple backend replicas are independent processes with independent memory spaces. Each replica's SignalR connections, group memberships, and hub state are local to that process. A client connected to one replica cannot receive events generated by another replica through in-process mechanisms alone.

### The Architectural Solution

A **shared SignalR Backplane** — a publish/subscribe messaging layer that all replicas connect to — allows events to cross replica boundaries. When any replica broadcasts a SignalR event, the backplane ensures every replica receives it and forwards it to its locally connected clients.

### The Implemented Solution

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Load balancing | **NGINX** with dynamic upstream discovery | Routes traffic to backend replicas |
| Sticky sessions | `hash $cookie_signalr_id consistent` | Ensures stable client-to-instance mapping |
| Backend instances | **ASP.NET Core 8.0** (multiple Docker containers) | API processing and SignalR connections |
| Backplane | **Redis** via `Microsoft.AspNetCore.SignalR.StackExchangeRedis` | Cross-instance event propagation |
| Signaling | **SignalR** (`TransactionHub`) | Real-time push to clients |
| Persistence | **SQLite** (shared volume, WAL mode) | Transaction data storage |

### The Result

A client connected to **Backend 1** receives real-time updates for transactions created on **Backend 2**, **Backend 3**, or any other replica. The Redis backplane transparently synchronizes SignalR events across all backend instances, making the distributed system behave like a single logical instance from the client's perspective.

---

*Documented for the Real-Time Financial Monitor project. Based on the actual implementation in the repository as of August 2026.*
