using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Hubs;
using FinancialMonitor.Api.Models;
using FinancialMonitor.Api.Repositories;
using Microsoft.AspNetCore.SignalR;

namespace FinancialMonitor.Api.Services;

public class TransactionService : ITransactionService
{
        private readonly ITransactionRepository _transactionRepository;
        private readonly IHubContext<TransactionHub> _hubContext;

        public TransactionService(
            ITransactionRepository transactionRepository,
            IHubContext<TransactionHub> hubContext)
        {
            _transactionRepository = transactionRepository;
            _hubContext = hubContext;
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

            var response = ToResponse(transaction);
            await _hubContext.Clients.All.SendAsync("TransactionCreated", ToCreatedPayload(transaction));

            return response;
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

            await _hubContext.Clients.All.SendAsync(
                "TransactionStatusUpdated",
                transactionId,
                request.Status.ToString());
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

        /// <summary>Builds the SignalR payload with the status sent as a string.</summary>
        private static TransactionCreatedPayload ToCreatedPayload(Transaction transaction)
        {
            return new TransactionCreatedPayload
            {
                TransactionId = transaction.TransactionId,
                Amount = transaction.Amount,
                Currency = transaction.Currency,
                Status = transaction.Status.ToString(),
                Timestamp = transaction.Timestamp
            };
        }
}
