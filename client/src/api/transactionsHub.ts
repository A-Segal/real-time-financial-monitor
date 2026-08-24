import * as signalR from '@microsoft/signalr'
import { isTransactionStatus } from '../types/transaction'
import { apiBaseUrl } from '../utils/apiBaseUrl'
import type { Transaction, TransactionStatus } from '../types/transaction'

// Sticky-session client ID. Random hex identifier stored in a "signalr_id"
// cookie so nginx's `hash $cookie_signalr_id consistent` routes all requests
// from this client to the same backend replica.

const SIGNALR_ID_COOKIE = 'signalr_id'

function getSignalrIdCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIGNALR_ID_COOKIE}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function generateClientId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function ensureStickyCookie(): string {
  let id = getSignalrIdCookie()
  if (!id) {
    id = generateClientId()
    document.cookie =
      `${SIGNALR_ID_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax;` +
      (window.location.protocol === 'https:' ? ' Secure;' : '')
  }
  return id
}

function hubUrl(): string {
  return `${apiBaseUrl()}/hubs/transactions`
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

  // Ensure sticky-session cookie exists before building the hub connection.
  ensureStickyCookie()

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
