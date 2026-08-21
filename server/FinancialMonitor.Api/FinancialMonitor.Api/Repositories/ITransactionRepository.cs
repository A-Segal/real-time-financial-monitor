using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.Repositories;

public interface ITransactionRepository
{
    Task<IEnumerable<Transaction>> GetAllTransactionsAsync();

    Task AddTransactionAsync(Transaction transaction);

    Task<bool> UpdateTransactionStatusAsync(Guid transactionId, TransactionStatus status);
}
