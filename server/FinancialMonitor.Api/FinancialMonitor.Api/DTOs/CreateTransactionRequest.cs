using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.DTOs;

/// <summary>Request payload for creating a new transaction.</summary>
public class CreateTransactionRequest
{
    public decimal amount { get; set; }

    public string currency { get; set; } = string.Empty;

    public TransactionStatus status { get; set; }

    public DateTime timestamp { get; set; }
}
