using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.DTOs;

public class TransactionResponse
{
    public Guid TransactionId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public TransactionStatus Status { get; set; }

    public DateTime Timestamp { get; set; }
}
