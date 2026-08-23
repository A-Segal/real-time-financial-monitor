import type { Transaction } from '../types/transaction'

/**
 * Mock transaction data for the UI-only phase.
 *
 * This module is intentionally isolated so it can be replaced later by a
 * data-fetching layer that returns the same `Transaction` shape from the API.
 */
export const mockTransactions: Transaction[] = [
  {
    transactionId: 'txn-9f2c1a04',
    amount: 1250.75,
    currency: 'USD',
    status: 'Completed',
    timestamp: '2026-08-23T09:14:00Z',
  },
  {
    transactionId: 'txn-7b35de90',
    amount: 340.0,
    currency: 'EUR',
    status: 'Pending',
    timestamp: '2026-08-23T09:02:00Z',
  },
  {
    transactionId: 'txn-4a81f2c7',
    amount: 89.99,
    currency: 'USD',
    status: 'Failed',
    timestamp: '2026-08-23T08:47:00Z',
  },
  {
    transactionId: 'txn-c20b447e',
    amount: 2100.0,
    currency: 'GBP',
    status: 'Completed',
    timestamp: '2026-08-23T08:21:00Z',
  },
  {
    transactionId: 'txn-e6d390b1',
    amount: 560.5,
    currency: 'USD',
    status: 'Pending',
    timestamp: '2026-08-23T07:58:00Z',
  },
  {
    transactionId: 'txn-81c5a9d3',
    amount: 42.25,
    currency: 'ILS',
    status: 'Completed',
    timestamp: '2026-08-23T07:33:00Z',
  },
  {
    transactionId: 'txn-3f9b82c6',
    amount: 730.0,
    currency: 'EUR',
    status: 'Failed',
    timestamp: '2026-08-23T07:01:00Z',
  },
  {
    transactionId: 'txn-a17c9e24',
    amount: 1530.4,
    currency: 'USD',
    status: 'Completed',
    timestamp: '2026-08-23T06:44:00Z',
  },
]

/**
 * Derive summary totals from a list of transactions.
 *
 * Keeping this as a pure helper (rather than hard-coding the card numbers)
 * lets the dashboard stay correct when the mock list is replaced by live data.
 */
export function summarizeTransactions(
  transactions: Transaction[],
): { total: number; pending: number; completed: number; failed: number } {
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
