import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TransactionsTable from '../../client/src/components/TransactionsTable'
import { transaction } from './fixtures'

afterEach(() => cleanup())

describe('TransactionsTable', () => {
  it('renders transaction details and an empty state', () => {
    render(<TransactionsTable transactions={[transaction()]} />)

    expect(screen.getByText('txn-1')).toBeInTheDocument()
    expect(screen.getByText('125.50')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()

    render(<TransactionsTable transactions={[]}/>)
    expect(screen.getByText('No transactions found.')).toBeInTheDocument()
  })

  it('allows pending transactions to select completed or failed', async () => {
    const onUpdateStatus = vi.fn()
    const user = userEvent.setup()
    render(<TransactionsTable transactions={[transaction()]} onUpdateStatus={onUpdateStatus} />)

    const select = screen.getByRole('combobox', { name: 'Update status for txn-1' })
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)

    await user.selectOptions(select, 'Completed')
    await user.selectOptions(select, 'Failed')
    expect(onUpdateStatus).toHaveBeenNthCalledWith(1, 'txn-1', 'Completed')
    expect(onUpdateStatus).toHaveBeenNthCalledWith(2, 'txn-1', 'Failed')
  })

  it('only renders status controls for pending rows', () => {
    render(
      <TransactionsTable
        transactions={[
          transaction({ transactionId: 'pending', status: 'Pending' }),
          transaction({ transactionId: 'completed', status: 'Completed' }),
          transaction({ transactionId: 'failed', status: 'Failed' }),
        ]}
        onUpdateStatus={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Update status for pending' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Update status for completed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Update status for failed' })).not.toBeInTheDocument()
  })

  it('omits the actions column when no pending transactions exist', () => {
    render(
      <TransactionsTable
        transactions={[transaction({ status: 'Completed' })]}
        onUpdateStatus={vi.fn()}
      />,
    )

    expect(screen.queryAllByRole('columnheader', { name: 'Actions' })).toHaveLength(0)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
