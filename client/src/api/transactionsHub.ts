import * as signalR from '@microsoft/signalr'
import { isTransactionStatus } from '../types/transaction'
import type { Transaction, TransactionStatus } from '../types/transaction'

function hubUrl(): string {
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  return `${base}/hubs/transactions`
}

interface TransactionCreatedPayload {
  transactionId: string
  amount: number
  currency: string
  status: string
  timestamp: string
}

interface TransactionStatusUpdatedPayload {
  transactionId: string
  status: TransactionStatus
}

export function connectToTransactionsHub(options: {
  onTransactionCreated: (txn: Transaction) => void
  onTransactionStatusUpdated: (payload: TransactionStatusUpdatedPayload) => void
}) {
  const { onTransactionCreated, onTransactionStatusUpdated } = options
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl())
    .withAutomaticReconnect()
    .build()

  connection.on('TransactionCreated', (payload: TransactionCreatedPayload) => {
    onTransactionCreated(normalizeCreatedPayload(payload))
  })

  connection.on(
    'TransactionStatusUpdated',
    (transactionId: string, status: string) => {
      if (typeof transactionId !== 'string' || transactionId.length === 0) {
        throw new Error('Invalid TransactionStatusUpdated payload.')
      }

      onTransactionStatusUpdated({
        transactionId,
        status: normalizeStatus(status),
      })
    },
  )

  connection
    .start()
    .catch((err) => {
      console.error('SignalR connection failed to start:', err)
    })

  return {
    connection,
    async teardown() {
      connection.off('TransactionCreated')
      connection.off('TransactionStatusUpdated')
      await connection.stop()
    },
  }
}

function normalizeStatus(status: string): TransactionStatus {
  if (isTransactionStatus(status)) {
    return status
  }
  throw new Error(`Unknown transaction status: "${status}".`)
}

function normalizeCreatedPayload(payload: TransactionCreatedPayload): Transaction {
  if (
    typeof payload?.transactionId !== 'string' ||
    typeof payload.amount !== 'number' ||
    !Number.isFinite(payload.amount) ||
    typeof payload.currency !== 'string' ||
    typeof payload.status !== 'string'
  ) {
    throw new Error('Invalid TransactionCreated payload.')
  }

  return {
    transactionId: payload.transactionId,
    amount: payload.amount,
    currency: payload.currency,
    status: normalizeStatus(payload.status),
    timestamp: payload.timestamp || new Date().toISOString(),
  }
}
