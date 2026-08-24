using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.Models;
using FinancialMonitor.Api.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace FinancialMonitor.Api.IntegrationTests.Repositories;

/// <summary>
///     Integration tests for <see cref="TransactionRepository"/> against a real
///     in-memory SQLite database. No mocking: every test creates its own isolated
///     <see cref="AppDbContext"/> with a fresh <see cref="SqliteConnection"/> so
///     no state leaks between tests.
/// </summary>
public class TransactionRepositoryIntegrationTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AppDbContext _context = null!;
    private TransactionRepository _repository = null!;

    public async Task InitializeAsync()
    {
        // Open a fresh in-memory SQLite connection and create the schema.
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new AppDbContext(options);
        await _context.Database.EnsureCreatedAsync();

        _repository = new TransactionRepository(_context);
    }

    public async Task DisposeAsync()
    {
        await _context.DisposeAsync();
        await _connection.DisposeAsync();
    }

    // ----------------------------------------------------------------------------
    // GetAllTransactionsAsync
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task GetAllTransactionsAsync_OnEmptyDatabase_ReturnsEmpty()
    {
        // Act
        var result = await _repository.GetAllTransactionsAsync();

        // Assert
        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetAllTransactionsAsync_AfterAddingTransactions_ReturnsOrderedByTimestampDesc()
    {
        // Arrange  create transactions with known timestamps (older first).
        var older = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 100m,
            Currency = "USD",
            Status = TransactionStatus.Pending,
            Timestamp = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
        };

        var newer = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 2500m,
            Currency = "ILS",
            Status = TransactionStatus.Completed,
            Timestamp = new DateTime(2026, 6, 15, 12, 0, 0, DateTimeKind.Utc)
        };

        var middle = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 50m,
            Currency = "EUR",
            Status = TransactionStatus.Failed,
            Timestamp = new DateTime(2026, 3, 20, 8, 30, 0, DateTimeKind.Utc)
        };

        _context.Transactions.AddRange(older, middle, newer);
        await _context.SaveChangesAsync();

        // Act
        var result = (await _repository.GetAllTransactionsAsync()).ToList();

        // Assert  returned in descending timestamp order: newest first.
        Assert.Equal(3, result.Count);
        Assert.Equal(newer.TransactionId, result[0].TransactionId);
        Assert.Equal(middle.TransactionId, result[1].TransactionId);
        Assert.Equal(older.TransactionId, result[2].TransactionId);
    }

    // ----------------------------------------------------------------------------
    // AddTransactionAsync
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task AddTransactionAsync_PersistsTransactionWithAllFields()
    {
        // Arrange
        var transaction = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 199.99m,
            Currency = "USD",
            Status = TransactionStatus.Pending,
            Timestamp = new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc)
        };

        // Act
        await _repository.AddTransactionAsync(transaction);

        // Assert  read back via a separate DbContext to ensure it was really persisted.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using var verifyContext = new AppDbContext(options);
        var saved = await verifyContext.Transactions
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TransactionId == transaction.TransactionId);

        Assert.NotNull(saved);
        Assert.Equal(transaction.TransactionId, saved.TransactionId);
        Assert.Equal(transaction.Amount, saved.Amount);
        Assert.Equal(transaction.Currency, saved.Currency);
        Assert.Equal(transaction.Status, saved.Status);
        Assert.Equal(transaction.Timestamp, saved.Timestamp);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync  Pending -> Completed
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_PendingToCompleted_ReturnsUpdated()
    {
        // Arrange
        var transaction = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 100m,
            Currency = "USD",
            Status = TransactionStatus.Pending,
            Timestamp = DateTime.UtcNow
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        // Act
        var outcome = await _repository.UpdateTransactionStatusAsync(
            transaction.TransactionId, TransactionStatus.Completed);

        // Assert
        Assert.Equal(TransactionUpdateOutcome.Updated, outcome);

        // Verify the status was actually persisted.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using var verifyContext = new AppDbContext(options);
        var saved = await verifyContext.Transactions
            .AsNoTracking()
            .FirstAsync(t => t.TransactionId == transaction.TransactionId);

        Assert.Equal(TransactionStatus.Completed, saved.Status);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync  Pending -> Failed
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_PendingToFailed_ReturnsUpdated()
    {
        // Arrange
        var transaction = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 250m,
            Currency = "ILS",
            Status = TransactionStatus.Pending,
            Timestamp = DateTime.UtcNow
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        // Act
        var outcome = await _repository.UpdateTransactionStatusAsync(
            transaction.TransactionId, TransactionStatus.Failed);

        // Assert
        Assert.Equal(TransactionUpdateOutcome.Updated, outcome);

        // Verify the status was actually persisted.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using var verifyContext = new AppDbContext(options);
        var saved = await verifyContext.Transactions
            .AsNoTracking()
            .FirstAsync(t => t.TransactionId == transaction.TransactionId);

        Assert.Equal(TransactionStatus.Failed, saved.Status);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync  unknown ID
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WithUnknownId_ReturnsNotFound()
    {
        // Act
        var outcome = await _repository.UpdateTransactionStatusAsync(
            Guid.NewGuid(), TransactionStatus.Completed);

        // Assert
        Assert.Equal(TransactionUpdateOutcome.NotFound, outcome);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync  already Completed
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WhenAlreadyCompleted_ReturnsNotPending()
    {
        // Arrange
        var transaction = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 100m,
            Currency = "USD",
            Status = TransactionStatus.Completed,
            Timestamp = DateTime.UtcNow
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        // Act  attempt to update an already-Completed transaction.
        var outcome = await _repository.UpdateTransactionStatusAsync(
            transaction.TransactionId, TransactionStatus.Failed);

        // Assert
        Assert.Equal(TransactionUpdateOutcome.NotPending, outcome);

        // Verify the original status is unchanged.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using var verifyContext = new AppDbContext(options);
        var saved = await verifyContext.Transactions
            .AsNoTracking()
            .FirstAsync(t => t.TransactionId == transaction.TransactionId);

        Assert.Equal(TransactionStatus.Completed, saved.Status);
    }

    // ----------------------------------------------------------------------------
    // UpdateTransactionStatusAsync  already Failed
    // ----------------------------------------------------------------------------

    [Fact]
    public async Task UpdateTransactionStatusAsync_WhenAlreadyFailed_ReturnsNotPending()
    {
        // Arrange
        var transaction = new Transaction
        {
            TransactionId = Guid.NewGuid(),
            Amount = 150m,
            Currency = "EUR",
            Status = TransactionStatus.Failed,
            Timestamp = DateTime.UtcNow
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        // Act  attempt to update an already-Failed transaction.
        var outcome = await _repository.UpdateTransactionStatusAsync(
            transaction.TransactionId, TransactionStatus.Completed);

        // Assert
        Assert.Equal(TransactionUpdateOutcome.NotPending, outcome);

        // Verify the original status is unchanged.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        await using var verifyContext = new AppDbContext(options);
        var saved = await verifyContext.Transactions
            .AsNoTracking()
            .FirstAsync(t => t.TransactionId == transaction.TransactionId);

        Assert.Equal(TransactionStatus.Failed, saved.Status);
    }
}
