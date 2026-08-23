using Microsoft.AspNetCore.SignalR;

namespace FinancialMonitor.Api.Hubs;

public class TransactionHub : Hub
{
    // Real-time updates are broadcast from TransactionService via IHubContext<TransactionHub>.
}
