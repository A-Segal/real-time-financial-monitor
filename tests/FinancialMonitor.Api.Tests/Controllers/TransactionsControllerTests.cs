using FinancialMonitor.Api.Controllers;
using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FinancialMonitor.Api.Tests.Controllers;

/// <summary>
///     Unit tests for <see cref="TransactionsController"/> with the service layer
///     fully mocked. No real database or HTTP pipeline is involved; only the
///     controller's routing, error handling, and response mapping are exercised.
/// </summary>
public class TransactionsControllerTests
{
    private readonly Mock<ITransactionService> _serviceMock;
    private readonly TransactionsController _controller;

    public TransactionsControllerTests()
    {
        _serviceMock = new Mock<ITransactionService>();
        _controller = new TransactionsController(
            _serviceMock.Object,
            NullLogger<TransactionsController>.Instance);
    }

    // ----------------------------------------------------------------------------
    // GetAllTransactions
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task GetAllTransactions_WhenTransactionsExist_Returns200WithList()
    {
        // Arrange
        var transactions = new List<TransactionResponse>
        {
            new()
            {
                TransactionId = Guid.NewGuid(),
                Amount = 100m,
                Currency = "USD",
                Status = Models.TransactionStatus.Pending,
                Timestamp = DateTime.UtcNow
            },
            new()
            {
                TransactionId = Guid.NewGuid(),
                Amount = 2500m,
                Currency = "ILS",
                Status = Models.TransactionStatus.Completed,
                Timestamp = DateTime.UtcNow
            }
        };

        _serviceMock.Setup(s => s.GetAllTransactionsAsync())
            .ReturnsAsync(transactions);

        // Act
        var result = await _controller.GetAllTransactions();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var returned = Assert.IsAssignableFrom<IEnumerable<TransactionResponse>>(okResult.Value);
        Assert.Equal(2, returned.Count());
    }

    [Fact]
    public async Task GetAllTransactions_WhenNoTransactions_Returns200WithEmptyList()
    {
        // Arrange
        _serviceMock.Setup(s => s.GetAllTransactionsAsync())
            .ReturnsAsync(new List<TransactionResponse>());

        // Act
        var result = await _controller.GetAllTransactions();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var returned = Assert.IsAssignableFrom<IEnumerable<TransactionResponse>>(okResult.Value);
        Assert.Empty(returned);
    }

    [Fact]
    public async Task GetAllTransactions_WhenServiceThrowsTransientError_Returns503()
    {
        // Arrange
        _serviceMock.Setup(s => s.GetAllTransactionsAsync())
            .ThrowsAsync(new SqliteException("SQLite Error 5: database is locked", 5));

        // Act
        var result = await _controller.GetAllTransactions();

        // Assert
        var statusCodeResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(503, statusCodeResult.StatusCode);
        Assert.Contains("temporarily unavailable", (string)statusCodeResult.Value!, StringComparison.OrdinalIgnoreCase);
    }

    // ----------------------------------------------------------------------------
    // AddTransaction
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransaction_WithValidRequest_Returns201Created()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 199.99m,
            Currency = "USD",
            Status = Models.TransactionStatus.Pending
        };

        var response = new TransactionResponse
        {
            TransactionId = Guid.NewGuid(),
            Amount = request.Amount,
            Currency = request.Currency,
            Status = request.Status,
            Timestamp = DateTime.UtcNow
        };

        _serviceMock.Setup(s => s.AddTransactionAsync(request))
            .ReturnsAsync(response);

        // Act
        var result = await _controller.AddTransaction(request);

        // Assert
        var statusCodeResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(201, statusCodeResult.StatusCode);

        var returned = Assert.IsType<TransactionResponse>(statusCodeResult.Value);
        Assert.Equal(response.TransactionId, returned.TransactionId);
        Assert.Equal(request.Amount, returned.Amount);
        Assert.Equal(request.Currency, returned.Currency);
    }

    [Fact]
    public async Task AddTransaction_WhenServiceThrowsArgumentException_Returns400()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 0m,
            Currency = "USD",
            Status = Models.TransactionStatus.Pending
        };

        _serviceMock.Setup(s => s.AddTransactionAsync(request))
            .ThrowsAsync(new ArgumentException("Transaction amount must be greater than zero."));

        // Act
        var result = await _controller.AddTransaction(request);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Transaction amount must be greater than zero.", badRequest.Value);
    }

    [Fact]
    public async Task AddTransaction_WhenServiceThrowsDbUpdateException_Returns409()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = "USD",
            Status = Models.TransactionStatus.Pending
        };

        _serviceMock.Setup(s => s.AddTransactionAsync(request))
            .ThrowsAsync(new DbUpdateException("Database is locked."));

        // Act
        var result = await _controller.AddTransaction(request);

        // Assert — transient SQLite contention should be 409, not 500.
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("concurrency conflict", (string)conflict.Value!);
    }

    [Fact]
    public async Task AddTransaction_WhenServiceThrowsSqliteException_Returns409()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = "USD",
            Status = Models.TransactionStatus.Pending
        };

        _serviceMock.Setup(s => s.AddTransactionAsync(request))
            .ThrowsAsync(new SqliteException("SQLite Error 5: database is locked", 5));

        // Act
        var result = await _controller.AddTransaction(request);

        // Assert
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("transient error", (string)conflict.Value!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AddTransaction_WhenServiceThrowsUnexpectedException_ReThrows()
    {
        // Arrange
        var request = new CreateTransactionRequest
        {
            Amount = 100m,
            Currency = "USD",
            Status = Models.TransactionStatus.Pending
        };

        _serviceMock.Setup(s => s.AddTransactionAsync(request))
            .ThrowsAsync(new InvalidOperationException("Unexpected database error."));

        // Act & Assert
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _controller.AddTransaction(request));

        Assert.Equal("Unexpected database error.", ex.Message);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatus
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatus_WithValidRequest_Returns204()
    {
        // Arrange
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .Returns(Task.CompletedTask);

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsArgumentException_Returns400()
    {
        // Arrange
        var transactionId = Guid.Empty;
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(new ArgumentException("Transaction ID must be provided."));

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Transaction ID must be provided.", badRequest.Value);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsKeyNotFoundException_Returns404()
    {
        // Arrange
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(new KeyNotFoundException($"Transaction with ID '{transactionId}' does not exist."));

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert
        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal($"Transaction with ID '{transactionId}' does not exist.", notFound.Value);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsInvalidOperationException_Returns409()
    {
        // Arrange
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Pending
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(new InvalidOperationException(
                $"Transaction with ID '{transactionId}' can only be updated while its status is 'Pending'."));

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(
            $"Transaction with ID '{transactionId}' can only be updated while its status is 'Pending'.",
            conflict.Value);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsDbUpdateException_Returns409()
    {
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(new DbUpdateException("SQLite database is locked."));

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert — transient SQLite contention should be 409, not 500.
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("concurrency conflict", (string)conflict.Value!);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsSqliteException_Returns409()
    {
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(new SqliteException("SQLite Error 5: database is locked", 5));

        // Act
        var result = await _controller.UpdateTransactionStatus(transactionId, request);

        // Assert
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("transient error", (string)conflict.Value!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateTransactionStatus_WhenServiceThrowsUnexpectedException_ReThrows()
    {
        // Arrange  use an exception type that none of the controller's catch blocks handle.
        var transactionId = Guid.NewGuid();
        var request = new UpdateTransactionStatusRequest
        {
            Status = Models.TransactionStatus.Completed
        };

        var unexpected = new TimeoutException("The database operation timed out.");
        _serviceMock.Setup(s => s.UpdateTransactionStatusAsync(transactionId, request))
            .ThrowsAsync(unexpected);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<TimeoutException>(
            () => _controller.UpdateTransactionStatus(transactionId, request));

        Assert.Equal("The database operation timed out.", ex.Message);
    }
}
