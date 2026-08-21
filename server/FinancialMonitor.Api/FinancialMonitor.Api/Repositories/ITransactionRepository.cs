using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.Repositories
{
    public interface ITransactionRepository
    {
        Task<IEnumerable<Transaction>> GetAllTransactionsAsync();

        Task AddTransactionAsync(Transaction transaction);

        Task UpdateTransactionStatusAsync(Guid transactionId, TransactionStatus status);
    }
}
