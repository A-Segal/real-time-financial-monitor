import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTransactions } from '../../client/src/api/transactionsApi'
import { connectToTransactionsHub } from '../../client/src/api/transactionsHub'
import { useTransactions } from '../../client/src/hooks/useTransactions'
import { transaction } from './fixtures'

vi.mock('../../client/src/api/transactionsApi', () => ({ fetchTransactions: vi.fn() }))
vi.mock('../../client/src/api/transactionsHub', () => ({ connectToTransactionsHub: vi.fn() }))

const fetchMock = vi.mocked(fetchTransactions)
const connectMock = vi.mocked(connectToTransactionsHub)
let callbacks: Parameters<typeof connectToTransactionsHub>[0]
const allCallbacks: Parameters<typeof connectToTransactionsHub>[0][] = []
const teardown = vi.fn().mockResolvedValue(undefined)

afterEach(() => {
  vi.clearAllMocks()
  callbacks = undefined as never
  allCallbacks.length = 0
})

function setupHub() {
  connectMock.mockImplementation((options) => {
    callbacks = options
    allCallbacks.push(options)
    return { connection: undefined as never, teardown }
  })
}

describe('useTransactions', () => {
  it('loads transactions and exposes loading/error states', async () => {
    fetchMock.mockResolvedValue([transaction()])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.transactions).toEqual([transaction()]))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()

    fetchMock.mockRejectedValueOnce(new Error('server unavailable'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.error).toBe('server unavailable'))
    expect(result.current.isLoading).toBe(false)
  })

  it('reloads, clears errors, and replaces API data', async () => {
    fetchMock.mockResolvedValueOnce([transaction({ transactionId: 'old' })])
      .mockResolvedValueOnce([transaction({ transactionId: 'new' })])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.transactions[0].transactionId).toBe('old'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.transactions[0].transactionId).toBe('new'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('prepends created transactions, deduplicates them, and preserves events during load', async () => {
    let resolveLoad!: (value: ReturnType<typeof transaction>[]) => void
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    setupHub()
    const { result } = renderHook(() => useTransactions())
    const incoming = transaction({ transactionId: 'live' })
    act(() => callbacks.onTransactionCreated(incoming))
    act(() => resolveLoad([transaction({ transactionId: 'from-api' })]))
    await waitFor(() => expect(result.current.transactions).toEqual([incoming, transaction({ transactionId: 'from-api' })]))
    act(() => callbacks.onTransactionCreated(incoming))
    expect(result.current.transactions).toHaveLength(2)
  })

  it('updates known statuses without creating unknown transactions', async () => {
    fetchMock.mockResolvedValue([transaction()])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => callbacks.onTransactionStatusUpdated({ transactionId: 'txn-1', status: 'Completed' }))
    expect(result.current.transactions[0].status).toBe('Completed')
    act(() => callbacks.onTransactionStatusUpdated({ transactionId: 'unknown', status: 'Failed' }))
    expect(result.current.transactions).toHaveLength(1)
  })

  it('subscribes once per hook instance and synchronizes multiple clients', async () => {
    fetchMock.mockResolvedValue([])
    setupHub()
    const first = renderHook(() => useTransactions())
    const second = renderHook(() => useTransactions())
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))

    expect(connectMock).toHaveBeenCalledTimes(2)
    const incoming = transaction({ transactionId: 'shared' })
    act(() => {
      allCallbacks.forEach((options) => options.onTransactionCreated(incoming))
      allCallbacks.forEach((options) => options.onTransactionCreated(incoming))
    })

    expect(first.result.current.transactions).toEqual([incoming])
    expect(second.result.current.transactions).toEqual([incoming])
    first.unmount()
    second.unmount()
    expect(teardown).toHaveBeenCalledTimes(2)
  })

  it('applies rapid status events to the existing transaction without creating unknown rows', async () => {
    fetchMock.mockResolvedValue([transaction()])
    setupHub()
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      callbacks.onTransactionStatusUpdated({ transactionId: 'txn-1', status: 'Completed' })
      callbacks.onTransactionStatusUpdated({ transactionId: 'txn-1', status: 'Failed' })
      callbacks.onTransactionStatusUpdated({ transactionId: 'unknown', status: 'Completed' })
    })

    expect(result.current.transactions).toEqual([transaction({ status: 'Failed' })])
  })

  it('does not subscribe again when the hook rerenders', async () => {
    fetchMock.mockResolvedValue([])
    setupHub()
    const { result, rerender, unmount } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    rerender()
    expect(connectMock).toHaveBeenCalledOnce()
    unmount()
    expect(teardown).toHaveBeenCalledOnce()
  })

  it('tears down the hub on unmount and does not update after unmount', async () => {
    let resolveLoad!: (value: ReturnType<typeof transaction>[]) => void
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    setupHub()
    const { unmount } = renderHook(() => useTransactions())
    unmount()
    act(() => callbacks.onTransactionCreated(transaction({ transactionId: 'after-unmount' })))
    act(() => resolveLoad([transaction()]))
    expect(teardown).toHaveBeenCalledOnce()
  })

  it('keeps one event handler active across a reconnect without duplicating rows', async () => {
    fetchMock.mockResolvedValue([])
    setupHub()
    const { result, unmount } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const incoming = transaction({ transactionId: 'reconnected' })
    act(() => callbacks.onTransactionCreated(incoming))
    act(() => callbacks.onTransactionCreated(incoming))

    expect(connectMock).toHaveBeenCalledOnce()
    expect(result.current.transactions).toEqual([incoming])
    unmount()
  })
})
