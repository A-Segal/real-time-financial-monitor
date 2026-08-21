using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.Services
{
    public interface ITransactionService
    {
        Task<IEnumerable<TransactionResponse>> GetAllTransactionsAsync();

        Task AddTransactionAsync(CreateTransactionRequest request);

        Task UpdateTransactionStatusAsync(Guid transactionId, UpdateTransactionStatusRequest request);
    }
}
