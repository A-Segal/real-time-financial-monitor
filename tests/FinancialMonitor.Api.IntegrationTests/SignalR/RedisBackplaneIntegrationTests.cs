using System.Net;
using System.Net.Http.Json;
using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.DTOs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace FinancialMonitor.Api.IntegrationTests.SignalR;

/// <summary>
///     Integration tests proving <em>cross-instance</em> SignalR event propagation
///     through the Redis backplane.
///
///     These tests boot two <see cref="WebApplicationFactory{T}"/> instances — each
///     backed by its own in-memory SQLite database and pointed at the same Redis
///     instance. A <see cref="HubConnection"/> is connected to each backend, and the
///     test verifies that a transaction created/updated on one backend propagates to a
///     client connected to the other backend.
///
///     <para>
///         <b>Prerequisite:</b> A local Redis instance must be running on
///         <c>127.0.0.1:6379</c> (the default). Start it with:
///         <c>docker compose -f docker-compose.yml up -d</c>
///     </para>
///
///     <para>
///         If Redis is not reachable, every test in this class fails immediately with
///         a clear message. Run with
///         <c>--filter "FullyQualifiedName!~RedisBackplane"</c> to skip them.
///     </para>
/// </summary>
[Collection("Redis-backed")]
public class RedisBackplaneIntegrationTests : IAsyncLifetime
{
    private const string HubPath = "/hubs/transactions";
    private const string RedisConnectionString = "127.0.0.1:6379";

    private WebApplicationFactory<Program> _factoryA = null!;
    private WebApplicationFactory<Program> _factoryB = null!;
    private HttpClient _clientA = null!;
    private HttpClient _clientB = null!;
    private IDatabase _redis = null!;
    private ConnectionMultiplexer _muxer = null!;

    /// <summary>
    ///     Before running the tests we validate that Redis is reachable. If it isn't,
    ///     every test in this class is skipped. This is done once rather than per-test
    ///     because the factories and connections are shared across the class.
    /// </summary>
    public async Task InitializeAsync()
    {
        // Attempt to connect to Redis — if it's not running, skip all tests.
        try
        {
            _muxer = await ConnectionMultiplexer.ConnectAsync(
                new ConfigurationOptions
                {
                    EndPoints = { RedisConnectionString },
                    ConnectTimeout = 3000,
                    SyncTimeout = 3000,
                    AbortOnConnectFail = false
                });

            _redis = _muxer.GetDatabase();

            // Verify the connection is actually usable.
            await _redis.PingAsync();

            // Flush the FinancialMonitor channel prefix so a prior test run's stray
            // messages don't leak into the current test.
            // Note: FLUSHALL is broad; we use the server commands aimed at the relevant
            // keys. Since we prefix all channel names with "FinancialMonitor", the safest
            // flush is FLUSHALL (acceptable for a local dev-only Redis).
            await _muxer.GetServer(_muxer.GetEndPoints().First()).FlushDatabaseAsync();
        }
        catch
        {
            // Redis is not reachable — signal via a static flag that tests check.
            RedisAvailable = false;
            return;
        }

        RedisAvailable = true;

        // Build two backend instances, each with its own isolated SQLite database.
        var dbConnectionA = new SqliteConnection("Data Source=:memory:");
        dbConnectionA.Open();
        var dbConnectionB = new SqliteConnection("Data Source=:memory:");
        dbConnectionB.Open();

        _factoryA = CreateFactoryWithInMemoryDb(dbConnectionA);
        _factoryB = CreateFactoryWithInMemoryDb(dbConnectionB);

        _clientA = _factoryA.CreateClient();
        _clientB = _factoryB.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _clientA?.Dispose();
        _clientB?.Dispose();
        _factoryA?.DisposeAsync();
        _factoryB?.DisposeAsync();

        if (_muxer is not null)
        {
            // Clean up all prefixed keys so test runs don't interfere with each other.
            try
            {
                await _muxer.GetServer(_muxer.GetEndPoints().First()).FlushDatabaseAsync();
            }
            catch
            {
                // Best-effort cleanup.
            }

            await _muxer.CloseAsync();
            _muxer.Dispose();
        }
    }

    // --------------------------------------------------------------------------------
    // TransactionCreated cross-instance propagation
    // --------------------------------------------------------------------------------

    [Fact]
    public async Task TransactionCreated_OnInstanceA_PropagatesViaRedisToClientB()
    {
        EnsureRedisAvailable();

        // Arrange — connect Client B to Backend B.
        await using var connectionB = await CreateConnectedClientAsync(_factoryB);

        var received = new List<TransactionCreatedPayload>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connectionB.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            received.Add(payload);
            receivedSignal.TrySetResult();
        });

        // Act — create a transaction through Backend A (via HTTP).
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 1500.00m,
            Currency = "ILS",
            Status = "Pending"
        };

        var createResponse = await _clientA.PostAsJsonAsync(ApiTestContracts.BasePath, request);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Wait for the event to arrive on Client B (via Redis propagation).
        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(15));

        // Assert — exactly one event, with the correct payload.
        var single = Assert.Single(received);
        Assert.Equal(created.TransactionId, single.TransactionId);
        Assert.Equal(request.Amount, single.Amount);
        Assert.Equal(request.Currency, single.Currency);
        Assert.Equal("Pending", single.Status);
        Assert.NotEqual(default, single.Timestamp);
    }

    [Fact]
    public async Task TransactionCreated_OnInstanceA_PropagatesViaRedisToClientAAndB()
    {
        EnsureRedisAvailable();

        // Arrange — connect Client A to Backend B, Client B to Backend A.
        // We deliberately swap the connections: Client A talks to Backend B and
        // Client B talks to Backend A to prove the backplane works in both directions.
        await using var connectionA = await CreateConnectedClientAsync(_factoryB);
        await using var connectionB = await CreateConnectedClientAsync(_factoryA);

        var receivedA = new List<TransactionCreatedPayload>();
        var receivedB = new List<TransactionCreatedPayload>();
        var signalA = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var signalB = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connectionA.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            receivedA.Add(payload);
            signalA.TrySetResult();
        });

        connectionB.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            receivedB.Add(payload);
            signalB.TrySetResult();
        });

        // Act — create a transaction through Backend A.
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 750.00m,
            Currency = "USD",
            Status = "Completed"
        };

        var createResponse = await _clientA.PostAsJsonAsync(ApiTestContracts.BasePath, request);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Both clients must receive the event.
        await Task.WhenAll(
            signalA.Task.WaitAsync(TimeSpan.FromSeconds(15)),
            signalB.Task.WaitAsync(TimeSpan.FromSeconds(15)));

        // Assert — both clients received the event.
        var singleA = Assert.Single(receivedA);
        var singleB = Assert.Single(receivedB);
        Assert.Equal(created.TransactionId, singleA.TransactionId);
        Assert.Equal(created.TransactionId, singleB.TransactionId);
    }

    // --------------------------------------------------------------------------------
    // TransactionStatusUpdated cross-instance propagation
    // --------------------------------------------------------------------------------

    [Fact]
    public async Task TransactionStatusUpdated_OnInstanceA_PropagatesViaRedisToClientB()
    {
        EnsureRedisAvailable();

        // Arrange — create a Pending transaction on Backend A first.
        var createResponse = await _clientA.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 250m, Currency = "USD", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Connect Client B to Backend B and register for status updates.
        await using var connectionB = await CreateConnectedClientAsync(_factoryB);

        var received = new List<(Guid TransactionId, string Status)>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connectionB.On<Guid, string>("TransactionStatusUpdated", (transactionId, status) =>
        {
            received.Add((transactionId, status));
            receivedSignal.TrySetResult();
        });

        // Act — update the status through Backend A.
        var updateResponse = await _clientA.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        // Wait for Client B to receive the propagated event.
        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(15));

        // Assert — exactly one event with the correct payload.
        var single = Assert.Single(received);
        Assert.Equal(created.TransactionId, single.TransactionId);
        Assert.Equal("Completed", single.Status);
    }

    // --------------------------------------------------------------------------------
    // No duplicate events from Redis backplane
    // --------------------------------------------------------------------------------

    [Fact]
    public async Task TransactionCreated_WithRedisBackplane_EmitsExactlyOneEvent()
    {
        EnsureRedisAvailable();

        // Act — create a transaction and listen on Backend A's own client.
        await using var connectionA = await CreateConnectedClientAsync(_factoryA);

        var received = new List<TransactionCreatedPayload>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connectionA.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            received.Add(payload);
            receivedSignal.TrySetResult();
        });

        var createResponse = await _clientA.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 100m, Currency = "EUR", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // Verify only one event — the Redis backplane must not cause duplication.
        Assert.Single(received);
    }

    // --------------------------------------------------------------------------------
    // Existing state stays in SQLite
    // --------------------------------------------------------------------------------

    [Fact]
    public async Task TransactionData_RemainsInSqlite_NotInRedis()
    {
        EnsureRedisAvailable();

        // Act — create a transaction through Backend A.
        var createResponse = await _clientA.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 99.99m, Currency = "GBP", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Verify the transaction is reachable via Backend A's API (SQLite-backed).
        var getResponseA = await _clientA.GetAsync(ApiTestContracts.BasePath);
        var transactionsA = await getResponseA.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto[]>(ApiTestContracts.JsonOptions);
        Assert.NotNull(transactionsA);
        Assert.Contains(transactionsA, t => t.TransactionId == created.TransactionId);

        // But it should not exist in Backend B's database (each backend has its own SQLite).
        var getResponseB = await _clientB.GetAsync(ApiTestContracts.BasePath);
        var transactionsB = await getResponseB.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto[]>(ApiTestContracts.JsonOptions);
        Assert.NotNull(transactionsB);
        Assert.DoesNotContain(transactionsB, t => t.TransactionId == created.TransactionId);
    }

    // --------------------------------------------------------------------------------
    // Pending-only enforcement still works
    // --------------------------------------------------------------------------------

    [Fact]
    public async Task PendingOnlyStatusTransition_StillEnforced_WithRedisBackplane()
    {
        EnsureRedisAvailable();

        // Arrange — create and complete a transaction on Backend A.
        var createResponse = await _clientA.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 50m, Currency = "USD", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Complete it.
        var completeResponse = await _clientA.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });
        Assert.Equal(HttpStatusCode.NoContent, completeResponse.StatusCode);

        // Act — attempt to update a non-pending transaction; must be 409 Conflict.
        var rejectedResponse = await _clientA.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Failed" });
        Assert.Equal(HttpStatusCode.Conflict, rejectedResponse.StatusCode);
    }

    // --------------------------------------------------------------------------------
    // Redis unavailable behavior
    // --------------------------------------------------------------------------------

    /// <summary>
    ///     This test verifies that the application handles a missing Redis configuration
    ///     gracefully and SignalR works without the backplane.
    ///
    ///     We build a factory with an empty Redis connection string, similar to the
    ///     default appsettings.json configuration.
    /// </summary>
    [Fact]
    public async Task WithoutRedisConfiguration_SignalRWorksAsNormal()
    {
        // Arrange — build a factory that explicitly has no Redis configured.
        using var dbConnection = new SqliteConnection("Data Source=:memory:");
        dbConnection.Open();

        using var factory = CreateFactoryWithInMemoryDb(dbConnection, configureRedis: false);
        using var client = factory.CreateClient();

        await using var connection = await CreateConnectedClientAsync(factory);

        var received = new List<TransactionCreatedPayload>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connection.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            received.Add(payload);
            receivedSignal.TrySetResult();
        });

        // Act
        var createResponse = await client.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 200m, Currency = "USD", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // Assert — SignalR works without Redis backplane.
        var single = Assert.Single(received);
        Assert.Equal("Pending", single.Status);
    }

    // --------------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------------

    private static bool RedisAvailable { get; set; } = true;

    private static void EnsureRedisAvailable()
    {
        if (!RedisAvailable)
        {
            throw new InvalidOperationException(
                "Redis is not running. Start it with: docker compose -f docker-compose.yml up -d. " +
                "Alternatively, skip these tests with: --filter \"FullyQualifiedName!~RedisBackplane\"");
        }
    }

    private static WebApplicationFactory<Program> CreateFactoryWithInMemoryDb(
        SqliteConnection dbConnection,
        bool configureRedis = true)
    {
        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Replace the real (file-backed) DbContext with an in-memory one.
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));

                    if (descriptor is not null)
                    {
                        services.Remove(descriptor);
                    }

                    var options = new DbContextOptionsBuilder<AppDbContext>()
                        .UseSqlite(dbConnection)
                        .Options;

                    services.AddSingleton(options);
                });

                if (configureRedis)
                {
                    // Override the Redis:ConnectionString configuration so the
                    // Program.cs conditional enables the Redis backplane.
                    builder.UseSetting("Redis:ConnectionString", RedisConnectionString);
                }
                else
                {
                    builder.UseSetting("Redis:ConnectionString", "");
                }
            });
    }

    private static async Task<HubConnection> CreateConnectedClientAsync(
        WebApplicationFactory<Program> factory)
    {
        var server = factory.Server;
        var hubUri = new Uri(server.BaseAddress.ToString().TrimEnd('/') + HubPath);

        var connection = new HubConnectionBuilder()
            .WithUrl(hubUri, options =>
                options.HttpMessageHandlerFactory = _ => server.CreateHandler())
            .Build();

        await connection.StartAsync();
        return connection;
    }
}
