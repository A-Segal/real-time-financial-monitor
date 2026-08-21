using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Models;
using FinancialMonitor.Api.Repositories;

namespace FinancialMonitor.Api.Services;

public class TransactionService : ITransactionService
{
        private readonly ITransactionRepository _transactionRepository;

        public TransactionService(ITransactionRepository transactionRepository)
        {
            _transactionRepository = transactionRepository;
        }

        public async Task<IEnumerable<TransactionResponse>> GetAllTransactionsAsync()
        {
            var transactions = await _transactionRepository.GetAllTransactionsAsync();

            return transactions.Select(ToResponse);
        }

        public async Task<TransactionResponse> AddTransactionAsync(CreateTransactionRequest request)
        {
            if (request is null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            if (request.Amount <= 0)
            {
                throw new ArgumentException("Transaction amount must be greater than zero.", nameof(request));
            }

            if (string.IsNullOrWhiteSpace(request.Currency))
            {
                throw new ArgumentException("Currency is required.", nameof(request));
            }

            if (!Enum.IsDefined(typeof(TransactionStatus), request.Status))
            {
                throw new ArgumentException("Invalid transaction status.", nameof(request));
            }

            var transaction = new Transaction
            {
                TransactionId = Guid.NewGuid(),
                Amount = request.Amount,
                Currency = request.Currency,
                Status = request.Status,
                Timestamp = DateTime.UtcNow
            };

            await _transactionRepository.AddTransactionAsync(transaction);

            return ToResponse(transaction);
        }

        public async Task UpdateTransactionStatusAsync(Guid transactionId, UpdateTransactionStatusRequest request)
        {
            if (transactionId == Guid.Empty)
            {
                throw new ArgumentException("Transaction ID must be provided.", nameof(transactionId));
            }

            if (request is null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            if (!Enum.IsDefined(typeof(TransactionStatus), request.Status))
            {
                throw new ArgumentException("Invalid transaction status.", nameof(request));
            }

            var updated = await _transactionRepository.UpdateTransactionStatusAsync(transactionId, request.Status);

            if (!updated)
            {
                throw new KeyNotFoundException($"Transaction with ID '{transactionId}' does not exist.");
            }
        }

        private static TransactionResponse ToResponse(Transaction transaction)
        {
            return new TransactionResponse
            {
                TransactionId = transaction.TransactionId,
                Amount = transaction.Amount,
                Currency = transaction.Currency,
                Status = transaction.Status,
                Timestamp = transaction.Timestamp
            };
        }
}
