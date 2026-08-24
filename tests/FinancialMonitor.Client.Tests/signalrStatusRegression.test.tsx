import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTransactions } from '../../client/src/hooks/useTransactions'
import { fetchTransactions } from '../../client/src/api/transactionsApi'
import { connectToTransactionsHub } from '../../client/src/api/transactionsHub'
import { transaction } from './fixtures'

vi.mock('../../client/src/api/transactionsApi', () => ({ fetchTransactions: vi.fn() }))
vi.mock('../../client/src/api/transactionsHub', () => ({ connectToTransactionsHub: vi.fn() }))

const fetchMock = vi.mocked(fetchTransactions)
const connectMock = vi.mocked(connectToTransactionsHub)
let hubCallbacks: Parameters<typeof connectToTransactionsHub>[0]
const teardown = vi.fn().mockResolvedValue(undefined)

afterEach(() => {
  vi.clearAllMocks()
  hubCallbacks = undefined as never
})

function setupHub() {
  connectMock.mockImplementation((options) => {
    hubCallbacks = options
    return { connection: undefined as never, teardown }
  })
}

describe('SignalR status update propagation regression tests', () => {
  it('should update the UI status when SignalR TransactionStatusUpdated arrives', async () => {
    fetchMock.mockResolvedValue([transaction({ status: 'Pending' })])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.transactions[0].status).toBe('Pending')

    // Simulate SignalR status update event arriving (as it would from the server)
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({
        transactionId: 'txn-1',
        status: 'Completed',
      })
    })

    // The UI should reflect the new status without a refresh
    expect(result.current.transactions[0].status).toBe('Completed')
  })

  it('should apply rapid SignalR status updates correctly', async () => {
    fetchMock.mockResolvedValue([transaction({ status: 'Pending' })])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Rapid updates simulating back-to-back SignalR events
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({
        transactionId: 'txn-1',
        status: 'Completed',
      })
      // Immediately followed by another update — should be applied in order
      hubCallbacks.onTransactionStatusUpdated({
        transactionId: 'txn-1',
        status: 'Failed',
      })
    })

    // The last status should win
    expect(result.current.transactions[0].status).toBe('Failed')
  })

  it('should not let SignalR status update revert a correct HTTP-optimistic update', async () => {
    fetchMock.mockResolvedValue([transaction({ status: 'Pending' })])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Simulate: HTTP update succeeds, optimistic update is applied
    act(() => {
      result.current.setTransactions((prev) =>
        prev.map((t) =>
          t.transactionId === 'txn-1' ? { ...t, status: 'Completed' } : t,
        ),
      )
    })
    expect(result.current.transactions[0].status).toBe('Completed')

    // Simulate: SignalR event arrives AFTER the optimistic update
    // This should NOT revert the status — it should be the same or later
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({
        transactionId: 'txn-1',
        status: 'Completed',
      })
    })

    // Still Completed (not reverted)
    expect(result.current.transactions[0].status).toBe('Completed')
  })

  it('should propagate SignalR status update to all connected hook instances', async () => {
    fetchMock.mockResolvedValue([transaction({ status: 'Pending' })])
    connectMock.mockImplementation((options) => {
      hubCallbacks = options
      allCallbacks.push(options)
      return { connection: undefined as never, teardown }
    })
    const allCallbacks: Parameters<typeof connectToTransactionsHub>[0][] = []

    const hook1 = renderHook(() => useTransactions())
    const hook2 = renderHook(() => useTransactions())

    await waitFor(() => expect(hook1.result.current.isLoading).toBe(false))
    await waitFor(() => expect(hook2.result.current.isLoading).toBe(false))

    // SignalR status update arrives to all clients
    act(() => {
      allCallbacks.forEach((cb) =>
        cb.onTransactionStatusUpdated({
          transactionId: 'txn-1',
          status: 'Failed',
        }),
      )
    })

    expect(hook1.result.current.transactions[0].status).toBe('Failed')
    expect(hook2.result.current.transactions[0].status).toBe('Failed')

    hook1.unmount()
    hook2.unmount()
  })

  it('should handle status update for a transaction that arrives via SignalR before HTTP fetch completes', async () => {
    // Simulate: fetch is slow, SignalR event arrives first
    let resolveFetch!: (value: ReturnType<typeof transaction>[]) => void
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    setupHub()
    const { result } = renderHook(() => useTransactions())

    // SignalR creates the transaction
    act(() => {
      hubCallbacks.onTransactionCreated(transaction({ transactionId: 'live-txn', status: 'Pending' }))
    })

    // SignalR status update for that transaction
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({ transactionId: 'live-txn', status: 'Completed' })
    })

    // Now HTTP fetch resolves
    act(() => resolveFetch([]))

    // The transaction should still be present and Completed
    await waitFor(() => {
      const txn = result.current.transactions.find((t) => t.transactionId === 'live-txn')
      expect(txn).toBeDefined()
      expect(txn!.status).toBe('Completed')
    })
  })

  it('should maintain correct count after SignalR status updates', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Pending' }),
      transaction({ transactionId: 'c', status: 'Pending' }),
    ])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.transactions).toHaveLength(3))

    // SignalR updates multiple transactions
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({ transactionId: 'a', status: 'Completed' })
      hubCallbacks.onTransactionStatusUpdated({ transactionId: 'b', status: 'Failed' })
    })

    expect(result.current.transactions).toHaveLength(3)
    expect(result.current.transactions.find((t) => t.transactionId === 'a')!.status).toBe('Completed')
    expect(result.current.transactions.find((t) => t.transactionId === 'b')!.status).toBe('Failed')
    expect(result.current.transactions.find((t) => t.transactionId === 'c')!.status).toBe('Pending')
  })

  it('should not add new transactions from status update events', async () => {
    fetchMock.mockResolvedValue([transaction({ transactionId: 'existing', status: 'Pending' })])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.transactions).toHaveLength(1))

    // Status update for unknown transaction should NOT create a new entry
    act(() => {
      hubCallbacks.onTransactionStatusUpdated({ transactionId: 'unknown-txn', status: 'Completed' })
    })

    expect(result.current.transactions).toHaveLength(1)
  })
})
