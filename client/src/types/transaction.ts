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

export function isTransactionStatus(value: string): value is TransactionStatus {
  return value === 'Pending' || value === 'Completed' || value === 'Failed'
}
