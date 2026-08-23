import type { Transaction } from '../../client/src/types/transaction'

export function transaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    transactionId: 'txn-1',
    amount: 125.5,
    currency: 'USD',
    status: 'Pending',
    timestamp: '2026-08-20T12:34:56.000Z',
    ...overrides,
  }
}
