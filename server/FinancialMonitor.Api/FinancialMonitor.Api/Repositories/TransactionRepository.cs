using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinancialMonitor.Api.Repositories
{
    public class TransactionRepository : ITransactionRepository
    {
        private readonly AppDbContext _context;

        public TransactionRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Transaction>> GetAllTransactionsAsync()
        {
            return await _context.Transactions.AsNoTracking().ToListAsync();
        }

        public async Task AddTransactionAsync(Transaction transaction)
        {
            await _context.Transactions.AddAsync(transaction);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateTransactionStatusAsync(Guid transactionId, TransactionStatus status)
        {
            var transaction = await _context.Transactions
                .FirstOrDefaultAsync(t => t.transactionId == transactionId);

            if (transaction is not null)
            {
                transaction.status = status;
                await _context.SaveChangesAsync();
            }
        }
    }
}
