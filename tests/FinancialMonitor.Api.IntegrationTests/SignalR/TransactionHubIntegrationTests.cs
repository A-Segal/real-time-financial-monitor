using System.Net;
using System.Net.Http.Json;
using FinancialMonitor.Api.DTOs;
using Microsoft.AspNetCore.SignalR.Client;

namespace FinancialMonitor.Api.IntegrationTests.SignalR;

/// <summary>
///     Integration tests for the <em>real</em> SignalR wire path exposed by the
///     <c>TransactionHub</c> (<c>/hubs/transactions</c>).
///
///     Unlike the unit tests, nothing here is mocked — not the hub, not
///     <see cref="Microsoft.AspNetCore.SignalR.IHubContext{T}"/>, not the client
///     transport. Each test boots a real <see cref="TestApplicationFactory"/> host, opens a
///     genuine <see cref="HubConnection"/> against that host's SignalR endpoint, and
///     drives the events through the real HTTP API (never by calling the service directly).
///
///     The events observed on the wire — <c>TransactionCreated</c> and
///     <c>TransactionStatusUpdated</c> — are the ones emitted by production
///     <see cref="FinancialMonitor.Api.Services.TransactionService"/> into the hub when a
///     transaction is created or its status changes.
/// </summary>
public class TransactionHubIntegrationTests : IAsyncLifetime
{
    private const string HubPath = "/hubs/transactions";

    private TestApplicationFactory _factory = null!;
    private HttpClient _httpClient = null!;

    // A fresh app + fresh isolated database for every test.
    public Task InitializeAsync()
    {
        _factory = new TestApplicationFactory();
        _httpClient = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _httpClient.Dispose();
        await _factory.DisposeAsync();
    }

    // ----------------------------------------------------------------------------
    // Test 1 — TransactionCreated
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransaction_OverRealHttp_PushesTransactionCreatedToRealSignalRClient()
    {
        // Arrange - connect the real SignalR client and register the handler BEFORE the
        // HTTP trigger fires, otherwise the push could legitimately be missed.
        await using var connection = await CreateConnectedClientAsync();

        var received = new List<TransactionCreatedPayload>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        connection.On<TransactionCreatedPayload>("TransactionCreated", payload =>
        {
            received.Add(payload);
            receivedSignal.TrySetResult();
        });

        // Act - create the transaction through the real HTTP API (the event's trigger).
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 1234.56m,
            Currency = "ILS",
            Status = "Pending"
        };

        var createResponse = await _httpClient.PostAsJsonAsync(ApiTestContracts.BasePath, request);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Wait deterministically for the wire message (bounded guarantee, no polling).
        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // Exactly one push, carrying the contract for the transaction just created.
        var single = Assert.Single(received);
        Assert.Equal(created.TransactionId, single.TransactionId);
        Assert.Equal(request.Amount, single.Amount);
        Assert.Equal(request.Currency, single.Currency);
        Assert.Equal("Pending", single.Status); // status is sent on the wire as a string
        Assert.NotEqual(default, single.Timestamp);
    }

    // ----------------------------------------------------------------------------
    // Test 2 — TransactionStatusUpdated
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStatus_OverRealHttp_PushesTransactionStatusUpdatedToRealSignalRClient()
    {
        // Arrange - connect the real SignalR client and register the handler up-front.
        await using var connection = await CreateConnectedClientAsync();

        var received = new List<(Guid TransactionId, string Status)>();
        var receivedSignal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        // TransactionStatusUpdated is emitted with two arguments on the wire:
        // (transactionId: Guid, status: string).
        connection.On<Guid, string>("TransactionStatusUpdated", (transactionId, status) =>
        {
            received.Add((transactionId, status));
            receivedSignal.TrySetResult();
        });

        // Arrange - a transaction must exist before its status can change, so create one
        // through the real HTTP API.
        var createResponse = await _httpClient.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 250m, Currency = "USD", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Act - update the status through the real HTTP API (the event's trigger).
        var updateResponse = await _httpClient.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        // Wait deterministically for the wire message (bounded guarantee, no polling).
        await receivedSignal.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // Exactly one push, carrying the values for the transaction just updated.
        var single = Assert.Single(received);
        Assert.Equal(created.TransactionId, single.TransactionId);
        Assert.Equal("Completed", single.Status);
    }

    // ----------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------

    /// <summary>
    ///     Opens a real <see cref="HubConnection"/> to the hub endpoint exposed by the
    ///     test application. The connection runs over the <c>TestServer</c>'s own
    ///     <see cref="System.Net.Http.HttpMessageHandler"/> (via
    ///     <see cref="TestApplicationFactory.Server"/>) so it exercises the genuine host
    ///     pipeline with no real TCP socket and no hard-coded port.
    /// </summary>
    private async Task<HubConnection> CreateConnectedClientAsync()
    {
        var server = _factory.Server;
        var hubUri = new Uri(server.BaseAddress.ToString().TrimEnd('/') + HubPath);

        var connection = new HubConnectionBuilder()
            .WithUrl(hubUri, options =>
                options.HttpMessageHandlerFactory = _ => server.CreateHandler())
            .Build();

        await connection.StartAsync();
        return connection;
    }
}
