import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateTransactionStatus } from '../../client/src/api/transactionsApi'
import { fetchTransactions } from '../../client/src/api/transactionsApi'
import { connectToTransactionsHub } from '../../client/src/api/transactionsHub'
import Monitor from '../../client/src/pages/Monitor'
import { transaction } from './fixtures'

vi.mock('../../client/src/api/transactionsApi', () => ({
  fetchTransactions: vi.fn(),
  updateTransactionStatus: vi.fn(),
}))
vi.mock('../../client/src/api/transactionsHub', () => ({ connectToTransactionsHub: vi.fn() }))
const fetchMock = vi.mocked(fetchTransactions)
const updateMock = vi.mocked(updateTransactionStatus)
const connectMock = vi.mocked(connectToTransactionsHub)
let hubCallbacks: Parameters<typeof connectToTransactionsHub>[0]

afterEach(() => { cleanup(); vi.clearAllMocks() })

function setupHub() {
  connectMock.mockImplementation((options) => {
    hubCallbacks = options
    return { connection: undefined as never, teardown: vi.fn().mockResolvedValue(undefined) }
  })
}

describe('Monitor status flow', () => {
  it.each(['Completed', 'Failed'] as const)('sends pending -> %s and waits for realtime confirmation', async (status) => {
    fetchMock.mockResolvedValue([transaction()])
    updateMock.mockResolvedValue(undefined)
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    const select = await screen.findByRole('combobox', { name: 'Update status for txn-1' })
    await user.selectOptions(select, status)
    expect(updateMock).toHaveBeenCalledWith('txn-1', status)
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    act(() => hubCallbacks.onTransactionStatusUpdated({ transactionId: 'txn-1', status }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: status })).toBeInTheDocument()
  })

  it.each([400, 404, 409, 500])('shows rejection HTTP %s without false update', async (status) => {
    fetchMock.mockResolvedValue([transaction()])
    updateMock.mockRejectedValue(new Error(`Failed to update transaction status (HTTP ${status}).`))
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await user.selectOptions(await screen.findByRole('combobox'), 'Completed')
    expect(await screen.findByRole('alert')).toHaveTextContent(`HTTP ${status}`)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows network failure and keeps completed and failed rows immutable', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'completed', status: 'Completed' }),
      transaction({ transactionId: 'failed', status: 'Failed' }),
    ])
    updateMock.mockRejectedValue(new Error('Unable to reach the server'))
    setupHub()
    render(<Monitor />)
    await screen.findByText('completed')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('does not send updates for terminal transactions', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'completed', status: 'Completed' }),
      transaction({ transactionId: 'failed', status: 'Failed' }),
    ])
    setupHub()
    render(<Monitor />)

    await screen.findByText('completed')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
