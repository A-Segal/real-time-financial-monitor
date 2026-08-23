import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectToTransactionsHub } from '../../client/src/api/transactionsHub'

const connection = {
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: class {
    withUrl = vi.fn().mockReturnThis()
    withAutomaticReconnect = vi.fn().mockReturnThis()
    build = vi.fn(() => connection)
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  connection.start.mockResolvedValue(undefined)
})

describe('connectToTransactionsHub', () => {
  it('builds, configures, starts, and tears down a reconnecting connection', async () => {
    const hub = connectToTransactionsHub({
      onTransactionCreated: vi.fn(),
      onTransactionStatusUpdated: vi.fn(),
    })

    expect(connection.on).toHaveBeenCalledTimes(2)
    expect(connection.start).toHaveBeenCalledOnce()
    await hub.teardown()
    expect(connection.off).toHaveBeenNthCalledWith(1, 'TransactionCreated')
    expect(connection.off).toHaveBeenNthCalledWith(2, 'TransactionStatusUpdated')
    expect(connection.stop).toHaveBeenCalledOnce()
  })

  it('logs start failures without throwing from connect', async () => {
    const error = new Error('connection failed')
    connection.start.mockRejectedValue(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    connectToTransactionsHub({
      onTransactionCreated: vi.fn(),
      onTransactionStatusUpdated: vi.fn(),
    })
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      'SignalR connection failed to start:', error,
    ))
    consoleError.mockRestore()
  })

  it('normalizes created and status events', () => {
    const onCreated = vi.fn()
    const onUpdated = vi.fn()
    connectToTransactionsHub({ onTransactionCreated: onCreated, onTransactionStatusUpdated: onUpdated })
    const createdHandler = connection.on.mock.calls.find(([name]) => name === 'TransactionCreated')![1]
    const updatedHandler = connection.on.mock.calls.find(([name]) => name === 'TransactionStatusUpdated')![1]

    createdHandler({ transactionId: 'txn-1', amount: 10, currency: 'USD', status: 'Completed', timestamp: '2026-01-01T00:00:00Z' })
    updatedHandler('txn-1', 'Failed')

    expect(onCreated).toHaveBeenCalledWith({
      transactionId: 'txn-1', amount: 10, currency: 'USD', status: 'Completed', timestamp: '2026-01-01T00:00:00Z',
    })
    expect(onUpdated).toHaveBeenCalledWith({ transactionId: 'txn-1', status: 'Failed' })
  })

  it('uses a timestamp for created payloads with a missing timestamp', () => {
    const onCreated = vi.fn()
    connectToTransactionsHub({ onTransactionCreated: onCreated, onTransactionStatusUpdated: vi.fn() })
    const handler = connection.on.mock.calls.find(([name]) => name === 'TransactionCreated')![1]

    handler({ transactionId: 'txn-1', amount: 10, currency: 'USD', status: 'Pending', timestamp: '' })

    expect(onCreated.mock.calls[0][0].timestamp).toEqual(expect.any(String))
  })

  it('rejects invalid event statuses', () => {
    const onCreated = vi.fn()
    const onUpdated = vi.fn()
    connectToTransactionsHub({ onTransactionCreated: onCreated, onTransactionStatusUpdated: onUpdated })
    const createdHandler = connection.on.mock.calls.find(([name]) => name === 'TransactionCreated')![1]
    const updatedHandler = connection.on.mock.calls.find(([name]) => name === 'TransactionStatusUpdated')![1]

    expect(() => createdHandler({ transactionId: 'txn-1', amount: 10, currency: 'USD', status: 'Invalid', timestamp: '' })).toThrow('Unknown transaction status')
    expect(() => updatedHandler('txn-1', 'Invalid')).toThrow('Unknown transaction status')
    expect(onCreated).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { transactionId: 'txn-1', amount: 10, status: 'Pending', timestamp: 'now' },
    { transactionId: 'txn-1', amount: '10', currency: 'USD', status: 'Pending', timestamp: 'now' },
  ])('rejects malformed created payloads without forwarding them: %j', (payload) => {
    const onCreated = vi.fn()
    connectToTransactionsHub({ onTransactionCreated: onCreated, onTransactionStatusUpdated: vi.fn() })
    const handler = connection.on.mock.calls.find(([name]) => name === 'TransactionCreated')![1]

    expect(() => handler(payload)).toThrow()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('rejects malformed status event arguments without forwarding them', () => {
    const onUpdated = vi.fn()
    connectToTransactionsHub({ onTransactionCreated: vi.fn(), onTransactionStatusUpdated: onUpdated })
    const handler = connection.on.mock.calls.find(([name]) => name === 'TransactionStatusUpdated')![1]

    expect(() => handler(undefined, 'Completed')).toThrow('Invalid TransactionStatusUpdated payload')
    expect(() => handler('txn-1', undefined)).toThrow()
    expect(onUpdated).not.toHaveBeenCalled()
  })
})
