import type { Transaction, TransactionTotals } from '../types/transaction'

export function summarizeTransactions(
  transactions: Transaction[],
): TransactionTotals {
  let pending = 0
  let completed = 0
  let failed = 0

  for (const txn of transactions) {
    if (txn.status === 'Pending') pending += 1
    else if (txn.status === 'Completed') completed += 1
    else failed += 1
  }

  return {
    total: transactions.length,
    pending,
    completed,
    failed,
  }
}
