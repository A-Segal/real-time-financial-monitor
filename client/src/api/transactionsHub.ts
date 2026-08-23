import * as signalR from '@microsoft/signalr'
import { isTransactionStatus } from '../types/transaction'
import type { Transaction, TransactionStatus } from '../types/transaction'

const HUB_URL = '/hubs/transactions'

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
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build()

  connection.on('TransactionCreated', (payload: TransactionCreatedPayload) => {
    onTransactionCreated(normalizeCreatedPayload(payload))
  })

  connection.on(
    'TransactionStatusUpdated',
    (transactionId: string, status: string) => {
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
  return {
    transactionId: payload.transactionId,
    amount: payload.amount,
    currency: payload.currency,
    status: normalizeStatus(payload.status),
    timestamp: payload.timestamp || new Date().toISOString(),
  }
}
