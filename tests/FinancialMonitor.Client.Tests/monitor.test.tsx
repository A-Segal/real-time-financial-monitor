import { cleanup, render, screen, within } from '@testing-library/react'
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
let _hubCallbacks: Parameters<typeof connectToTransactionsHub>[0]

afterEach(() => { cleanup(); vi.clearAllMocks() })

function setupHub() {
  connectMock.mockImplementation((options) => {
    _hubCallbacks = options
    return { connection: undefined as never, teardown: vi.fn().mockResolvedValue(undefined) }
  })
}

describe('Monitor status flow', () => {
  it.each(['Completed', 'Failed'] as const)('sends pending -> %s and updates optimistically', async (status) => {
    fetchMock.mockResolvedValue([transaction()])
    updateMock.mockResolvedValue(undefined)
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    const select = await screen.findByRole('combobox', { name: 'Update status for txn-1' })
    await user.selectOptions(select, status)
    expect(updateMock).toHaveBeenCalledWith('txn-1', status)
    // The optimistic update immediately reflects the new status,
    // so the select disappears and the status is shown.
    expect(screen.queryByRole('combobox', { name: 'Update status for txn-1' })).not.toBeInTheDocument()
    const statusCells = screen.getAllByText(status)
    expect(statusCells.some((el) => el.closest('td'))).toBe(true)
  })

  it.each([400, 404, 409, 500])('shows rejection HTTP %s without false update', async (status) => {
    fetchMock.mockResolvedValue([transaction()])
    updateMock.mockRejectedValue(new Error(`Failed to update transaction status (HTTP ${status}).`))
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Update status for txn-1' }), 'Completed')
    expect(await screen.findByRole('alert')).toHaveTextContent(`HTTP ${status}`)
    expect(screen.getByRole('combobox', { name: 'Update status for txn-1' })).toBeInTheDocument()
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
    expect(screen.queryByRole('combobox', { name: /Update status/ })).not.toBeInTheDocument()
  })

  it('does not send updates for terminal transactions', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'completed', status: 'Completed' }),
      transaction({ transactionId: 'failed', status: 'Failed' }),
    ])
    setupHub()
    render(<Monitor />)

    await screen.findByText('completed')
    expect(screen.queryByRole('combobox', { name: /Update status/ })).not.toBeInTheDocument()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('Monitor status filter', () => {
  it('renders a status filter with correct options', async () => {
    fetchMock.mockResolvedValue([])
    setupHub()
    render(<Monitor />)
    const filter = await screen.findByRole('combobox', { name: 'Filter:' })
    expect(filter).toBeInTheDocument()
    const options = within(filter).getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveValue('all')
    expect(options[1]).toHaveValue('Pending')
    expect(options[2]).toHaveValue('Completed')
    expect(options[3]).toHaveValue('Failed')
  })

  it('shows all transactions when filter is All', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
      transaction({ transactionId: 'c', status: 'Failed' }),
    ])
    setupHub()
    render(<Monitor />)
    await screen.findByText('a')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })

  it('shows only pending when Pending filter is selected', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
      transaction({ transactionId: 'c', status: 'Failed' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Pending')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
    expect(screen.queryByText('c')).not.toBeInTheDocument()
  })

  it('shows only completed when Completed filter is selected', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
      transaction({ transactionId: 'c', status: 'Failed' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Completed')
    expect(screen.queryByText('a')).not.toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.queryByText('c')).not.toBeInTheDocument()
  })

  it('shows only failed when Failed filter is selected', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
      transaction({ transactionId: 'c', status: 'Failed' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Failed')
    expect(screen.queryByText('a')).not.toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })

  it('does not trigger any API or SignalR request when filter changes', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    vi.clearAllMocks()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Completed')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('shows new pending transaction immediately when Pending filter is active', async () => {
    fetchMock.mockResolvedValue([transaction({ transactionId: 'initial', status: 'Pending' })])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('initial')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Pending')
    expect(screen.getByText('initial')).toBeInTheDocument()
    // Simulate a new pending transaction via SignalR
    _hubCallbacks.onTransactionCreated(transaction({ transactionId: 'new-pending', status: 'Pending' }))
    // The React state update from the SignalR callback needs to flush —
    // use findByText to wait for the re-render.
    expect(await screen.findByText('new-pending')).toBeInTheDocument()
  })

  it('hides new completed transaction when Pending filter is active', async () => {
    fetchMock.mockResolvedValue([transaction({ transactionId: 'initial', status: 'Pending' })])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('initial')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Pending')
    // Simulate a new completed transaction via SignalR
    _hubCallbacks.onTransactionCreated(transaction({ transactionId: 'new-completed', status: 'Completed' }))
    // Should be hidden from the table (the snackbar may still show it)
    const table = await screen.findByRole('table')
    expect(within(table).queryByText('new-completed')).not.toBeInTheDocument()
    // Switching to Completed filter should show it in the table
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Completed')
    expect(within(table).getByText('new-completed')).toBeInTheDocument()
  })

  it('removes a transaction from filtered view when status update makes it leave the filter', async () => {
    fetchMock.mockResolvedValue([transaction({ transactionId: 'a', status: 'Pending' })])
    updateMock.mockResolvedValue(undefined)
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    // Select Pending filter
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Pending')
    expect(screen.getByText('a')).toBeInTheDocument()
    // Update status to Completed via the status control
    await user.selectOptions(screen.getByRole('combobox', { name: 'Update status for a' }), 'Completed')
    // Should disappear from Pending filtered view
    expect(screen.queryByText('a')).not.toBeInTheDocument()
    // But still exist in state — switch to Completed filter
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Completed')
    expect(screen.getByText('a')).toBeInTheDocument()
  })
})

describe('Monitor view switcher', () => {
  it('renders view switcher with Table active by default', async () => {
    fetchMock.mockResolvedValue([])
    setupHub()
    render(<Monitor />)
    const tableBtn = await screen.findByRole('button', { name: 'Table' })
    const dashboardBtn = screen.getByRole('button', { name: 'Dashboard' })
    expect(tableBtn).toBeInTheDocument()
    expect(dashboardBtn).toBeInTheDocument()
    expect(tableBtn).toHaveAttribute('aria-pressed', 'true')
    expect(dashboardBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches between Table and Dashboard views', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    // Table view shows the table
    expect(screen.getByRole('table')).toBeInTheDocument()
    // Switch to Dashboard
    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    // Table should be hidden in Dashboard view
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Summary cards should still be visible
    expect(screen.getByText('Total Transactions')).toBeInTheDocument()
    // Dashboard view shows card for the transaction
    expect(screen.getByText('a')).toBeInTheDocument()
    // Switch back to Table
    await user.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('preserves filter when switching views', async () => {
    fetchMock.mockResolvedValue([
      transaction({ transactionId: 'a', status: 'Pending' }),
      transaction({ transactionId: 'b', status: 'Completed' }),
    ])
    setupHub()
    const user = userEvent.setup()
    render(<Monitor />)
    await screen.findByText('a')
    // Set filter to Pending
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter:' }), 'Pending')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
    // Switch to Dashboard and back
    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Table' }))
    // Filter should still be active
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
  })
})
