using System.Net;
using System.Net.Http.Json;
using FinancialMonitor.Api.IntegrationTests;

var factory = new TestApplicationFactory();
var client = factory.CreateClient();

var createResponse = await client.PostAsJsonAsync(
    ApiTestContracts.BasePath,
    new ApiTestContracts.CreateTransactionRequestDto { Amount = 100m, Currency = "USD", Status = "Pending" });
var created = await createResponse.Content.ReadFromJsonAsync<ApiTestContracts.TransactionDto>(ApiTestContracts.JsonOptions);

var tasks = Enumerable.Range(0, 10).Select(_ =>
    client.PutAsJsonAsync(
        $"{ApiTestContracts.BasePath}/{created!.TransactionId}/status",
        new ApiTestContracts.UpdateTransactionStatusRequestDto { Status = "Completed" }));

var responses = await Task.WhenAll(tasks);
foreach (var r in responses)
{
    var body = await r.Content.ReadAsStringAsync();
    Console.WriteLine($"  {(int)r.StatusCode} {r.StatusCode}: {body}");
}

// Also test concurrent creates
Console.WriteLine("\n--- Concurrent creates ---");
var createTasks = Enumerable.Range(0, 5).Select(i =>
    client.PostAsJsonAsync(
        ApiTestContracts.BasePath,
        new ApiTestContracts.CreateTransactionRequestDto { Amount = 200m + i, Currency = "ILS", Status = "Pending" }));
var createResponses = await Task.WhenAll(createTasks);
foreach (var r in createResponses)
{
    var body = await r.Content.ReadAsStringAsync();
    Console.WriteLine($"  {(int)r.StatusCode} {r.StatusCode}: {body}");
}

await factory.DisposeAsync();
