namespace FinancialMonitor.Api.Models;

public class Transaction
{
    public Guid transactionId { get; set; }

    public decimal amount { get; set; }

    public string currency { get; set; } = string.Empty;

    public TransactionStatus status { get; set; }

    public DateTime timestamp { get; set; }
}

public enum TransactionStatus
{
    Pending,
    Completed,
    Failed
}