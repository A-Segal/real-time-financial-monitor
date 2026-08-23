using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinancialMonitor.Api.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly AppDbContext _context;

    public TransactionRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Transaction>> GetAllTransactionsAsync()
    {
        return await _context.Transactions
            .AsNoTracking()
            .OrderByDescending(t => t.Timestamp)
            .ToListAsync();
    }

    public async Task AddTransactionAsync(Transaction transaction)
    {
        await _context.Transactions.AddAsync(transaction);
        await _context.SaveChangesAsync();
    }

    public async Task<TransactionUpdateOutcome> UpdateTransactionStatusAsync(Guid transactionId, TransactionStatus status)
    {
        var transaction = await _context.Transactions
            .FirstOrDefaultAsync(t => t.TransactionId == transactionId);

        if (transaction is null)
        {
            return TransactionUpdateOutcome.NotFound;
        }

        if (transaction.Status != TransactionStatus.Pending)
        {
            return TransactionUpdateOutcome.NotPending;
        }

        transaction.Status = status;
        await _context.SaveChangesAsync();
        return TransactionUpdateOutcome.Updated;
    }
}
