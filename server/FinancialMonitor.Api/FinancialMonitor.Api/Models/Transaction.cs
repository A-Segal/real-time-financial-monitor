namespace FinancialMonitor.Api.Models;

public class Transaction
{
    public Guid TransactionId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public TransactionStatus Status { get; set; }

    public DateTime Timestamp { get; set; }
}

public enum TransactionStatus
{
    Pending,
    Completed,
    Failed
}

public enum TransactionUpdateOutcome
{
    Updated,
    NotFound,
    NotPending
}