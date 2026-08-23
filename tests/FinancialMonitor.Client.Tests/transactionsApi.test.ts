import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createTransaction,
  fetchTransactions,
  updateTransactionStatus,
} from '../../client/src/api/transactionsApi'
import { transaction } from './fixtures'

afterEach(() => vi.restoreAllMocks())

describe('fetchTransactions', () => {
  it('parses valid and empty arrays', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([transaction()]), { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 })))

    await expect(fetchTransactions()).resolves.toEqual([transaction()])
    await expect(fetchTransactions()).resolves.toEqual([])
  })

  it.each([400, 500])('propagates HTTP %s as ApiError', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))

    await expect(fetchTransactions()).rejects.toMatchObject({
      name: 'ApiError',
      status,
      message: `Failed to load transactions (HTTP ${status}).`,
    })
  })

  it('maps network failures and malformed JSON to consistent errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchTransactions()).rejects.toBeInstanceOf(ApiError)
    await expect(fetchTransactions()).rejects.toThrow('Unable to reach the server')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 200 })))
    await expect(fetchTransactions()).rejects.toThrow('unexpected response')
  })

  it.each([
    null,
    {},
    [{ ...transaction(), amount: '125.50' }],
    [{ ...transaction(), status: 'Unknown' }],
    [{ ...transaction(), timestamp: 42 }],
    [{ ...transaction(), amount: Number.NaN }],
  ])('rejects an invalid payload: %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    ))

    await expect(fetchTransactions()).rejects.toThrow('unexpected response')
  })

  it('requests the transactions endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTransactions()

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions')
  })
})

describe('createTransaction', () => {
  it('serializes the input and normalizes the created transaction', async () => {
    const created = transaction({ transactionId: 'created-1', status: 'Completed' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(created), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTransaction({ amount: 42.5, currency: 'EUR', status: 'Completed' }))
      .resolves.toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 42.5, currency: 'EUR', status: 'Completed' }),
    })
  })

  it.each([400, 500])('propagates HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(createTransaction({ amount: 1, currency: 'USD', status: 'Pending' }))
      .rejects.toMatchObject({ status })
  })

  it('rejects network and malformed response failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(createTransaction({ amount: 1, currency: 'USD', status: 'Pending' }))
      .rejects.toThrow('Unable to reach the server')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 201 })))
    await expect(createTransaction({ amount: 1, currency: 'USD', status: 'Pending' }))
      .rejects.toThrow('unexpected response')
  })
})

describe('updateTransactionStatus', () => {
  it('sends the status to the correct endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateTransactionStatus('txn-1', 'Completed')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions/txn-1/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' }),
    })
  })

  it.each([400, 404, 409, 500])('propagates HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(updateTransactionStatus('txn-1', 'Failed')).rejects.toMatchObject({ status })
  })

  it('maps network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(updateTransactionStatus('txn-1', 'Completed')).rejects.toThrow(
      'Unable to reach the server',
    )
  })
})
