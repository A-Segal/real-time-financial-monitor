using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.DTOs;

/// <summary>Response payload representing a transaction.</summary>
public class TransactionResponse
{
    public Guid transactionId { get; set; }

    public decimal amount { get; set; }

    public string currency { get; set; } = string.Empty;

    public TransactionStatus status { get; set; }

    public DateTime timestamp { get; set; }
}
