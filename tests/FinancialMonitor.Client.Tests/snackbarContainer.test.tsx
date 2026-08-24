import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SnackbarContainer from '../../client/src/components/SnackbarContainer'
import { transaction } from './fixtures'

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('SnackbarContainer', () => {
  it('renders nothing when no new transactions', () => {
    const { container } = render(
      <SnackbarContainer newTransactions={[]} onConsumed={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows a snackbar for a new transaction', () => {
    vi.useFakeTimers()
    render(
      <SnackbarContainer
        newTransactions={[transaction({ transactionId: 'txn-snackbar' })]}
        onConsumed={vi.fn()}
      />
    )

    // The snackbar should appear with the transaction details
    expect(screen.getByText('txn-snackbar')).toBeInTheDocument()
    expect(screen.getByText('NEW TRANSACTION')).toBeInTheDocument()
    // The amount should be formatted
    expect(screen.getByText('$125.50')).toBeInTheDocument()
  })

  it('applies entering phase on initial render', () => {
    vi.useFakeTimers()
    const { container } = render(
      <SnackbarContainer
        newTransactions={[transaction({ transactionId: 'txn-enter' })]}
        onConsumed={vi.fn()}
      />
    )

    const snackbar = container.querySelector('.snackbar')
    expect(snackbar?.className).toContain('snackbar--entering')
  })

  it('transitions through phases: entering → visible → exiting', async () => {
    vi.useFakeTimers()
    const onConsumed = vi.fn()
    const { container } = render(
      <SnackbarContainer
        newTransactions={[transaction({ transactionId: 'txn-phase' })]}
        onConsumed={onConsumed}
      />
    )

    // Initially entering
    let snackbar = container.querySelector('.snackbar')
    expect(snackbar?.className).toContain('snackbar--entering')

    // After 400ms → visible
    act(() => { vi.advanceTimersByTime(400) })
    snackbar = container.querySelector('.snackbar')
    expect(snackbar?.className).toContain('snackbar--visible')

    // After 4000ms → exiting
    act(() => { vi.advanceTimersByTime(4000) })
    snackbar = container.querySelector('.snackbar')
    expect(snackbar?.className).toContain('snackbar--exiting')

    // After 350ms → removed and onConsumed called
    act(() => { vi.advanceTimersByTime(350) })
    expect(container.querySelector('.snackbar')).toBeNull()
    expect(onConsumed).toHaveBeenCalledWith('txn-phase')
  })

  it('deduplicates transactions by ID', () => {
    vi.useFakeTimers()
    const onConsumed = vi.fn()
    const txn = transaction({ transactionId: 'dedup-txn' })
    const { container } = render(
      <SnackbarContainer
        newTransactions={[txn, txn]}
        onConsumed={onConsumed}
      />
    )

    // Should only render one snackbar
    const snackbars = container.querySelectorAll('.snackbar')
    expect(snackbars).toHaveLength(1)
  })

  it('handles multiple distinct transactions', () => {
    vi.useFakeTimers()
    render(
      <SnackbarContainer
        newTransactions={[
          transaction({ transactionId: 'txn-1' }),
          transaction({ transactionId: 'txn-2' }),
        ]}
        onConsumed={vi.fn()}
      />
    )

    expect(screen.getByText('txn-1')).toBeInTheDocument()
    expect(screen.getByText('txn-2')).toBeInTheDocument()
  })

  it('shows new transactions added later', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <SnackbarContainer
        newTransactions={[transaction({ transactionId: 'first' })]}
        onConsumed={vi.fn()}
      />
    )

    expect(screen.getByText('first')).toBeInTheDocument()

    // Add another transaction
    rerender(
      <SnackbarContainer
        newTransactions={[
          transaction({ transactionId: 'first' }),
          transaction({ transactionId: 'second' }),
        ]}
        onConsumed={vi.fn()}
      />
    )

    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('sets aria-live to polite', () => {
    vi.useFakeTimers()
    render(
      <SnackbarContainer
        newTransactions={[transaction({ transactionId: 'aria-txn' })]}
        onConsumed={vi.fn()}
      />
    )

    const container = screen.getByLabelText('New transaction notifications')
    expect(container).toHaveAttribute('aria-live', 'polite')
  })
})
