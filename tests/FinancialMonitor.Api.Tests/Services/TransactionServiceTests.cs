using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Hubs;
using FinancialMonitor.Api.Models;
using FinancialMonitor.Api.Repositories;
using FinancialMonitor.Api.Services;
using Microsoft.AspNetCore.SignalR;
using Moq;

namespace FinancialMonitor.Api.Tests.Services;

/// <summary>
///      Unit tests for <see cref="TransactionService"/>.
///
///      The tests are fully isolated: the repository and the SignalR hub are mocked,
///      so no SQLite / EF Core database, no HTTP traffic, and no real SignalR
///      connection are involved.
/// </summary>
public class TransactionServiceTests
{
    // When the service stamps a timestamp itself (DateTime.UtcNow) it is expected to be
    // "now", so we assert it is within a small window of the test's own clock rather than
    // depending on an exact value.
    private static readonly TimeSpan TimestampTolerance = TimeSpan.FromSeconds(5);

    // An enum value that is deliberately not one of the defined TransactionStatus values,
    // used to exercise the service's "invalid status" validation path.
    private const TransactionStatus InvalidStatus = (TransactionStatus)999;

    // ----------------------------------------------------------------------------
    // GetAllTransactionsAsync
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task GetAllTransactionsAsync_WhenRepositoryReturnsTransactions_MapsToResponses()
    {
        // Arrange
        var transactions = new List<Transaction>
        {
            new()
            {
                TransactionId = Guid.NewGuid(),
                Amount = 100.50m,
                Currency = "USD",
                Status = TransactionStatus.Pending,
                Timestamp = new DateTime(2026, 1, 15, 10, 30, 0, DateTimeKind.Utc)
            },
            new()
            {
                TransactionId = Guid.NewGuid(),
                Amount = 2500m,
                Currency = "ILS",
                Status = TransactionStatus.Completed,
                Timestamp = new DateTime(2026, 2, 20, 14, 45, 0, DateTimeKind.Utc)
            }
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.GetAllTransactionsAsync())
            .ReturnsAsync(transactions);

        var service = CreateService(repositoryMock);

        // Act
        var result = (await service.GetAllTransactionsAsync()).ToList();

        // Assert
        Assert.Equal(2, result.Count);

        var first = result[0];
        Assert.Equal(transactions[0].TransactionId, first.TransactionId);
        Assert.Equal(transactions[0].Amount, first.Amount);
        Assert.Equal(transactions[0].Currency, first.Currency);
        Assert.Equal(transactions[0].Status, first.Status);
        Assert.Equal(transactions[0].Timestamp, first.Timestamp);

        var second = result[1];
        Assert.Equal(transactions[1].TransactionId, second.TransactionId);
        Assert.Equal(transactions[1].Amount, second.Amount);
        Assert.Equal(transactions[1].Currency, second.Currency);
        Assert.Equal(transactions[1].Status, second.Status);
        Assert.Equal(transactions[1].Timestamp, second.Timestamp);
    }

    [Fact]
    public async Task GetAllTransactionsAsync_OnEmptyRepository_ReturnsEmptyCollectionAndReadsOnce()
    {
        // Arrange
        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.GetAllTransactionsAsync())
            .ReturnsAsync(new List<Transaction>());

        var service = CreateService(repositoryMock);

        // Act
        var result = await service.GetAllTransactionsAsync();

        // Assert - an empty source still yields an empty, non-null result...
        Assert.NotNull(result);
        Assert.Empty(result);

        // ...and the repository is read exactly once (no accidental double query).
        repositoryMock.Verify(
            r => r.GetAllTransactionsAsync(),
            Times.Once);
    }

    // ----------------------------------------------------------------------------
    // AddTransactionAsync - success
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransactionAsync_WithValidRequest_CreatesTransactionAndReturnsResponse()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 199.99m,
            Currency = "USD",
            Status = TransactionStatus.Completed
        };

        var addedTransaction = default(Transaction)!;
        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.AddTransactionAsync(It.IsAny<Transaction>()))
            .Callback<Transaction>(t => addedTransaction = t)
            .Returns(Task.CompletedTask);

        var service = CreateService(repositoryMock);

        var before = DateTime.UtcNow;

        // Act
        var response = await service.AddTransactionAsync(request);

        var after = DateTime.UtcNow;

        // Assert - the transaction passed to the repository was constructed correctly.
        Assert.NotNull(addedTransaction);
        Assert.NotEqual(Guid.Empty, addedTransaction.TransactionId);
        Assert.Equal(request.Amount, addedTransaction.Amount);
        Assert.Equal(request.Currency, addedTransaction.Currency);
        Assert.Equal(request.Status, addedTransaction.Status);
        // Timestamp was generated by the service; it should be reasonably "now".
        Assert.InRange(addedTransaction.Timestamp, before - TimestampTolerance, after + TimestampTolerance);

        // Assert - the returned response mirrors the created transaction.
        Assert.Equal(addedTransaction.TransactionId, response.TransactionId);
        Assert.Equal(request.Amount, response.Amount);
        Assert.Equal(request.Currency, response.Currency);
        Assert.Equal(request.Status, response.Status);

        repositoryMock.Verify(
            r => r.AddTransactionAsync(It.IsAny<Transaction>()),
            Times.Once);
    }

    // ----------------------------------------------------------------------------
    // AddTransactionAsync - validation
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransactionAsync_WithNullRequest_ThrowsArgumentNullException()
    {
        // Arrange
        var repositoryMock = new Mock<ITransactionRepository>();
        var service = CreateService(repositoryMock);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => service.AddTransactionAsync(null!));

        VerifyRepositoryNeverCalled(repositoryMock);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-10.5)]
    public async Task AddTransactionAsync_WithNonPositiveAmount_ThrowsArgumentException(decimal amount)
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = amount,
            Currency = "USD",
            Status = TransactionStatus.Pending
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        var service = CreateService(repositoryMock);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.AddTransactionAsync(request));

        VerifyRepositoryNeverCalled(repositoryMock);
    }

    [Fact]
    public async Task AddTransactionAsync_WithEmptyCurrency_ThrowsArgumentException()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = string.Empty,
            Status = TransactionStatus.Pending
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        var service = CreateService(repositoryMock);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.AddTransactionAsync(request));

        VerifyRepositoryNeverCalled(repositoryMock);
    }

    [Fact]
    public async Task AddTransactionAsync_WithWhitespaceCurrency_ThrowsArgumentException()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = "   ",
            Status = TransactionStatus.Pending
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        var service = CreateService(repositoryMock);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.AddTransactionAsync(request));

        VerifyRepositoryNeverCalled(repositoryMock);
    }

    [Fact]
    public async Task AddTransactionAsync_WithInvalidEnumStatus_ThrowsArgumentException()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = "USD",
            Status = InvalidStatus
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        var service = CreateService(repositoryMock);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.AddTransactionAsync(request));

        VerifyRepositoryNeverCalled(repositoryMock);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync - success
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WithValidRequest_UpdatesStatusAndNotifiesAfterUpdate()
    {
        // Arrange
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = TransactionStatus.Completed
        };

        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.UpdateTransactionStatusAsync(It.IsAny<Guid>(), It.IsAny<TransactionStatus>()))
            .ReturnsAsync(true);

        var hubContext = CreateHubContextMock(out var sentMessages);

        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act
        await service.UpdateTransactionStatusAsync(transactionId, request);

        // Assert - repository invoked once with the correct ID and status.
        repositoryMock.Verify(
            r => r.UpdateTransactionStatusAsync(transactionId, TransactionStatus.Completed),
            Times.Once);

        // Assert - exactly one SignalR message was sent and it is the correct contract.
        Assert.Single(sentMessages);
        Assert.Equal("TransactionStatusUpdated", sentMessages[0].Method);

        var args = sentMessages[0].Arguments;
        Assert.Equal(2, args.Length);
        Assert.Equal(transactionId, args[0]); // transaction ID
        Assert.Equal(TransactionStatus.Completed.ToString(), args[1]); // status as string
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync - validation
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WithEmptyTransactionId_ThrowsArgumentException()
    {
        // Arrange
        var request = new UpdateTransactionStatusRequest { Status = TransactionStatus.Pending };

        var repositoryMock = new Mock<ITransactionRepository>();
        var hubContext = CreateHubContextMock(out var sentMessages);
        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.UpdateTransactionStatusAsync(Guid.Empty, request));

        VerifyRepositoryNeverCalled(repositoryMock);
        Assert.Empty(sentMessages);
    }

    [Fact]
    public async Task UpdateTransactionStatusAsync_WithNullRequest_ThrowsArgumentNullException()
    {
        // Arrange
        var repositoryMock = new Mock<ITransactionRepository>();
        var hubContext = CreateHubContextMock(out var sentMessages);
        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => service.UpdateTransactionStatusAsync(Guid.NewGuid(), null!));

        VerifyRepositoryNeverCalled(repositoryMock);
        Assert.Empty(sentMessages);
    }

    [Fact]
    public async Task UpdateTransactionStatusAsync_WithInvalidEnumStatus_ThrowsArgumentException()
    {
        // Arrange
        var request = new UpdateTransactionStatusRequest { Status = InvalidStatus };

        var repositoryMock = new Mock<ITransactionRepository>();
        var hubContext = CreateHubContextMock(out var sentMessages);
        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.UpdateTransactionStatusAsync(Guid.NewGuid(), request));

        VerifyRepositoryNeverCalled(repositoryMock);
        Assert.Empty(sentMessages);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync - transaction not found
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WhenTransactionNotFound_ThrowsKeyNotFoundExceptionAndDoesNotNotify()
    {
        // Arrange
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest { Status = TransactionStatus.Completed };

        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.UpdateTransactionStatusAsync(It.IsAny<Guid>(), It.IsAny<TransactionStatus>()))
            .ReturnsAsync(false);

        var hubContext = CreateHubContextMock(out var sentMessages);
        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => service.UpdateTransactionStatusAsync(transactionId, request));

        repositoryMock.Verify(
            r => r.UpdateTransactionStatusAsync(transactionId, TransactionStatus.Completed),
            Times.Once);
        Assert.Empty(sentMessages);
    }

    // ----------------------------------------------------------------------------
    // SignalR verification
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransactionAsync_WithValidRequest_SendsTransactionCreatedNotification()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 549.99m,
            Currency = "EUR",
            Status = TransactionStatus.Pending
        };

        var addedTransaction = default(Transaction)!;
        var repositoryMock = new Mock<ITransactionRepository>();
        repositoryMock.Setup(r => r.AddTransactionAsync(It.IsAny<Transaction>()))
            .Callback<Transaction>(t => addedTransaction = t)
            .Returns(Task.CompletedTask);

        var hubContext = CreateHubContextMock(out var sentMessages);
        var service = new TransactionService(repositoryMock.Object, hubContext.Object);

        // Act
        await service.AddTransactionAsync(request);

        // Assert - exactly one SignalR message with the documented contract.
        Assert.Single(sentMessages);
        Assert.Equal("TransactionCreated", sentMessages[0].Method);

        var args = sentMessages[0].Arguments;
        Assert.Single(args);

        var payload = Assert.IsType<TransactionCreatedPayload>(args[0]);
        Assert.Equal(addedTransaction.TransactionId, payload.TransactionId);
        Assert.Equal(request.Amount, payload.Amount);
        Assert.Equal(request.Currency, payload.Currency);
        // The contract sends the status as a string.
        Assert.Equal(TransactionStatus.Pending.ToString(), payload.Status);
        Assert.Equal(addedTransaction.Timestamp, payload.Timestamp);
    }

    // ----------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------

    private static TransactionService CreateService(Mock<ITransactionRepository> repositoryMock)
    {
        var hubContext = CreateHubContextMock(out _);
        return new TransactionService(repositoryMock.Object, hubContext.Object);
    }

    /// <summary>
    ///     Builds a mocked <see cref="IHubContext{TransactionHub}"/> so the service can issue
    ///     SignalR notifications without opening a real connection. Every
    ///     <c>Clients.All.SendAsync</c> call is captured into <paramref name="messages"/>
    ///     so it can be asserted.
    /// </summary>
    /// <remarks>
    ///     SignalR's public <c>SendAsync</c> is an extension method over the client proxy's
    ///     <see cref="IClientProxy.SendCoreAsync"/>, so we mock that core method. This keeps
    ///     the verification independent of the transport.
    /// </remarks>
    private static Mock<IHubContext<TransactionHub>> CreateHubContextMock(
        out List<SentMessage> messages)
    {
        var captured = new List<SentMessage>();

        var allProxyMock = new Mock<IClientProxy>();
        allProxyMock.Setup(p => p.SendCoreAsync(
                It.IsAny<string>(),
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Callback<string, object?[], CancellationToken>((method, args, _) =>
                captured.Add(new SentMessage(method, args)))
            .Returns(Task.CompletedTask);

        var clientsMock = new Mock<IHubClients>();
        clientsMock.Setup(c => c.All).Returns(allProxyMock.Object);

        var hubContextMock = new Mock<IHubContext<TransactionHub>>();
        hubContextMock.Setup(h => h.Clients).Returns(clientsMock.Object);

        messages = captured;
        return hubContextMock;
    }

    private static void VerifyRepositoryNeverCalled(Mock<ITransactionRepository> repositoryMock)
    {
        repositoryMock.Verify(
            r => r.AddTransactionAsync(It.IsAny<Transaction>()),
            Times.Never);
        repositoryMock.Verify(
            r => r.UpdateTransactionStatusAsync(It.IsAny<Guid>(), It.IsAny<TransactionStatus>()),
            Times.Never);
        repositoryMock.Verify(
            r => r.GetAllTransactionsAsync(),
            Times.Never);
    }

    /// <summary>A recorded SignalR send, captured for assertion.</summary>
    private sealed record SentMessage(string Method, object?[] Arguments);
}
