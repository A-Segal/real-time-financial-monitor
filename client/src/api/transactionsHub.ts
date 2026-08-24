import * as signalR from '@microsoft/signalr'
import { isTransactionStatus } from '../types/transaction'
import type { Transaction, TransactionStatus } from '../types/transaction'

// ---------------------------------------------------------------------------
// Sticky-session client ID.
//
// Generates a random client identifier on first load and stores it in a
// cookie named "signalr_id".  This cookie is sent with every request to
// the backend, enabling nginx's `hash $cookie_signalr_id consistent`
// directive to route all requests from this client to the same backend
// replica — including the very first SignalR /negotiate request.
//
// The cookie is set with:
//   - Path /     → sent on every subpath
//   - Secure     → only over HTTPS (safe in production)
//   - SameSite=Lax → preserved during normal navigation
// ---------------------------------------------------------------------------

const SIGNALR_ID_COOKIE = 'signalr_id'

function getSignalrIdCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIGNALR_ID_COOKIE}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

/** Generate a short random hex ID for sticky-session routing. */
function generateClientId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ensure a sticky-session cookie exists before any SignalR request. */
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

/**
 * Returns the runtime SignalR hub URL.
 * Priority:
 *   1. window.__RUNTIME_CONFIG__.apiUrl (set at container start by nginx envsubst)
 *   2. import.meta.env.VITE_API_URL (build-time Vite env var, used in dev)
 *   3. '' (relative URLs, works with Vite proxy in dev)
 */
function hubUrl(): string {
  let base = ''
  if (
    typeof window !== 'undefined' &&
    window.__RUNTIME_CONFIG__?.apiUrl &&
    window.__RUNTIME_CONFIG__.apiUrl !== '$VITE_API_URL'
  ) {
    base = window.__RUNTIME_CONFIG__.apiUrl
  } else {
    base = (import.meta.env.VITE_API_URL ?? '')
  }
  const cleaned = base.replace(/\/+$/, '')
  return `${cleaned}/hubs/transactions`
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
  // The cookie is set synchronously (it only sets if absent), so it's
  // available for the very first /negotiate request that SignalR sends.
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
