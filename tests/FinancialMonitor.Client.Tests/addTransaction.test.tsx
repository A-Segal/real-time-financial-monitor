import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransaction } from '../../client/src/api/transactionsApi'
import AddTransaction from '../../client/src/pages/AddTransaction'
import { transaction } from './fixtures'

vi.mock('../../client/src/api/transactionsApi', () => ({ createTransaction: vi.fn() }))
const createMock = vi.mocked(createTransaction)
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AddTransaction', () => {
  it('validates required amount and currency without calling the API', async () => {
    const user = userEvent.setup()
    render(<AddTransaction onCreated={vi.fn()} />)
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    const currency = screen.getByRole('textbox', { name: 'Currency' })

    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid positive amount')
    await user.type(amount, '-1')
    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid positive amount')
    await user.clear(amount)
    await user.type(amount, '12.5')
    await user.clear(currency)
    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('currency code')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('normalizes valid input, submits it, and navigates after success', async () => {
    const onCreated = vi.fn()
    createMock.mockResolvedValue(transaction({ transactionId: 'created-1' }))
    const user = userEvent.setup()
    render(<AddTransaction onCreated={onCreated} />)
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '42.75')
    await user.clear(screen.getByRole('textbox', { name: 'Currency' }))
    await user.type(screen.getByRole('textbox', { name: 'Currency' }), 'eur')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Initial status' }), 'Completed')
    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))

    expect(createMock).toHaveBeenCalledWith({ amount: 42.75, currency: 'EUR', status: 'Completed' })
    expect(await screen.findByRole('status')).toHaveTextContent('created-1')
    expect(onCreated).toHaveBeenCalledOnce()
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(null)
  })

  it.each([400, 500])('shows API error %s and preserves input', async (status) => {
    createMock.mockRejectedValue(new Error(`Failed to create transaction (HTTP ${status}).`))
    const user = userEvent.setup()
    render(<AddTransaction onCreated={vi.fn()} />)
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    await user.type(amount, '10')
    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`HTTP ${status}`)
    expect(amount).toHaveValue(10)
  })

  it('shows network errors and preserves input', async () => {
    createMock.mockRejectedValue(new Error('Unable to reach the server'))
    const user = userEvent.setup()
    render(<AddTransaction onCreated={vi.fn()} />)
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    await user.type(amount, '10')
    await user.click(screen.getByRole('button', { name: 'Create Transaction' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    expect(amount).toHaveValue(10)
  })
})
