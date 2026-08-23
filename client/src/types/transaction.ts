/**
 * Client-side transaction domain types.
 *
 * The shape mirrors the backend `TransactionResponse` DTO so that mock data
 * can later be swapped for real API data without changing the UI components.
 */

export type TransactionStatus = 'Pending' | 'Completed' | 'Failed'

export interface Transaction {
  transactionId: string
  amount: number
  currency: string
  status: TransactionStatus
  timestamp: string
}

export interface TransactionTotals {
  total: number
  pending: number
  completed: number
  failed: number
}
