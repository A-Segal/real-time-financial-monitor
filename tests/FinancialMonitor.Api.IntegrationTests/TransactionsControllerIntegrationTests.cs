using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace FinancialMonitor.Api.IntegrationTests;

/// <summary>
///     Integration tests hitting the <em>real</em> application over HTTP.
///
///     These are deliberately distinct from the unit tests for
///     <see cref="Services.TransactionService"/>: nothing is mocked here. The request
///     flows through the genuine HTTP pipeline
///     (controller → service → repository → EF Core/SQLite) and persists to a real,
///     per-test SQLite database that is migrated by the real <c>Program</c> startup.
///
///     Each test boots its own <see cref="TestApplicationFactory"/>, so it gets both a
///     fresh application instance and a fresh, isolated database.
/// </summary>
public class TransactionsControllerIntegrationTests : IAsyncLifetime
{
    private TestApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    // A fresh app + fresh database for every test.
    public Task InitializeAsync()
    {
        _factory = new TestApplicationFactory();
        _client = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    // ----------------------------------------------------------------------------
    // GET /api/transactions
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task GetAllTransactions_OnEmptyDatabase_Returns200AndEmptyArray()
    {
        // Act
        var response = await _client.GetAsync(ApiTestContracts.BasePath);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var transactions = await response.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto[]>(ApiTestContracts.JsonOptions);

        Assert.NotNull(transactions);
        Assert.Empty(transactions);
    }

    [Fact]
    public async Task GetAllTransactions_AfterCreate_ReturnsPersistedTransaction()
    {
        // Arrange - create one transaction through the real API.
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 2500m,
            Currency = "ILS",
            Status = "Pending"
        };

        var createResponse = await _client.PostAsJsonAsync(ApiTestContracts.BasePath, request);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        // Act
        var response = await _client.GetAsync(ApiTestContracts.BasePath);

        // Assert - the created transaction is really in the database.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var transactions = await response.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto[]>(ApiTestContracts.JsonOptions);

        Assert.NotNull(transactions);
        var transaction = Assert.Single(transactions);
        Assert.Equal(request.Amount, transaction.Amount);
        Assert.Equal(request.Currency, transaction.Currency);
        Assert.Equal(request.Status, transaction.Status);
        Assert.NotEqual(Guid.Empty, transaction.TransactionId);
    }

    // ----------------------------------------------------------------------------
    // POST /api/transactions
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransaction_WithValidRequest_Returns201CreatedWithMappedBody()
    {
        // Arrange
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 199.99m,
            Currency = "USD",
            Status = "Completed"
        };

        // Act
        var response = await _client.PostAsJsonAsync(ApiTestContracts.BasePath, request);

        // Assert - 201 with a Location to the full resource... (the API returns 201 + body).
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);

        Assert.NotNull(created);
        Assert.NotEqual(Guid.Empty, created.TransactionId);
        Assert.Equal(request.Amount, created.Amount);
        Assert.Equal(request.Currency, created.Currency);
        Assert.Equal(request.Status, created.Status);
        // The service stamps a UTC timestamp on creation.
        Assert.NotEqual(default, created.Timestamp);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-0.01)]
    [InlineData(-10.5)]
    public async Task AddTransaction_WithNonPositiveAmount_Returns400(decimal amount)
    {
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = amount,
            Currency = "USD",
            Status = "Pending"
        };

        var response = await _client.PostAsJsonAsync(ApiTestContracts.BasePath, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task AddTransaction_WithMissingOrWhitespaceCurrency_Returns400(string? currency)
    {
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 100m,
            Currency = currency ?? string.Empty,
            Status = "Pending"
        };

        var response = await _client.PostAsJsonAsync(ApiTestContracts.BasePath, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AddTransaction_WithInvalidStatus_Returns400()
    {
        var request = new ApiTestContracts.CreateTransactionRequestDto
        {
            Amount = 100m,
            Currency = "USD",
            Status = "NotARealStatus"
        };

        var response = await _client.PostAsJsonAsync(ApiTestContracts.BasePath, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AddTransaction_WithMalformedJsonBody_Returns400()
    {
        // A syntactically invalid JSON payload fails at model binding.
        using var malformed = new StringContent("{ not valid json", Encoding.UTF8, "application/json");

        var response = await _client.PostAsync(ApiTestContracts.BasePath, malformed);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AddTransaction_WithMissingBody_Returns400()
    {
        // An empty object body fails validation (default amount 0). Serialized explicitly
        // because there is no meaningful typed DTO for "no usable fields".
        using var empty = new StringContent("{}", Encoding.UTF8, "application/json");

        var response = await _client.PostAsync(ApiTestContracts.BasePath, empty);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ----------------------------------------------------------------------------
    // PUT /api/transactions/{id}/status
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatus_WithValidRequest_Returns204AndPersistsChange()
    {
        // Arrange - create a real transaction and capture its ID.
        var createResponse = await _client.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 100m, Currency = "USD", Status = "Pending" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);
        Assert.NotNull(created);

        // Act - transition it to Completed.
        var updateResponse = await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });

        // Assert - 204 No Content.
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        // Assert - the change was really persisted (retrieved via the real pipeline).
        var getAllResponse = await _client.GetAsync(ApiTestContracts.BasePath);
        var transactions = await getAllResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto[]>(ApiTestContracts.JsonOptions);

        Assert.NotNull(transactions);
        var updated = Assert.Single(transactions);
        Assert.Equal("Completed", updated.Status);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WithUnknownId_Returns404()
    {
        var unknownId = Guid.NewGuid();

        var response = await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{unknownId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WithEmptyGuidId_Returns400()
    {
        // Guid.Empty triggers the service's "transaction ID must be provided" guard.
        var response = await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{Guid.Empty}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WithInvalidStatus_Returns400()
    {
        // The status is unknown, so serialization into TransactionStatus fails with a 400.
        var createResponse = await _client.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 100m, Currency = "USD", Status = "Pending" });
        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);

        var response = await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created!.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "NotARealStatus" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WithCompletedIdempotentUpdate_Returns204()
    {
        // Arrange - create then complete.
        var createResponse = await _client.PostAsJsonAsync(
            ApiTestContracts.BasePath,
            new ApiTestContracts.CreateTransactionRequestDto { Amount = 50m, Currency = "EUR", Status = "Pending" });
        var created = await createResponse.Content
            .ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);

        await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created!.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });

        // Act - completing again is idempotent and still succeeds.
        var second = await _client.PutAsJsonAsync(
            $"{ApiTestContracts.BasePath}/{created.TransactionId}/status",
            new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" });

        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
    }
}
