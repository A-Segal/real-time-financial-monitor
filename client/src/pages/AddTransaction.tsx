import { useState, type FormEvent } from 'react'
import { createTransaction } from '../api/transactionsApi'
import type { TransactionStatus } from '../types/transaction'

const STATUSES: TransactionStatus[] = ['Pending', 'Completed', 'Failed']

interface AddTransactionProps {
  onCreated: () => void
}

export default function AddTransaction({ onCreated }: AddTransactionProps) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [status, setStatus] = useState<TransactionStatus>('Pending')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setCreatedId(null)

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive amount.')
      return
    }
    const trimmedCurrency = currency.trim().toUpperCase()
    if (!trimmedCurrency) {
      setError('Please enter a currency code, e.g. USD.')
      return
    }

    setSubmitting(true)
    try {
      const created = await createTransaction({
        amount: parsedAmount,
        currency: trimmedCurrency,
        status,
      })
      setCreatedId(created.transactionId)
      setAmount('')
      setCurrency('USD')
      setStatus('Pending')
      onCreated()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create transaction.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard">
      <header className="app-header">
        <div className="app-header__brand">Real-Time Financial Monitor</div>
        <h1 className="app-header__title">Add Transaction</h1>
      </header>

      <form className="txn-form" onSubmit={handleSubmit} noValidate>
        <p className="txn-form__intro">
          Fill in the details below to create a new transaction.
        </p>

        <label className="txn-form__field">
          <span className="txn-form__label">Amount</span>
          <input
            className="txn-form__input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Amount"
          />
        </label>

        <label className="txn-form__field">
          <span className="txn-form__label">Currency</span>
          <input
            className="txn-form__input"
            type="text"
            maxLength={6}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
            aria-label="Currency"
          />
        </label>

        <label className="txn-form__field">
          <span className="txn-form__label">Initial Status</span>
          <select
            className="txn-form__input"
            value={status}
            onChange={(e) => setStatus(e.target.value as TransactionStatus)}
            aria-label="Initial status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="txn-form__message txn-form__message--error" role="alert">
            {error}
          </p>
        )}

        {createdId && (
          <p className="txn-form__message txn-form__message--success" role="status">
            Transaction <span className="txn-form__id">{createdId}</span> was
            created successfully.
          </p>
        )}

        <button
          type="submit"
          className="txn-form__submit"
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Create Transaction'}
        </button>
      </form>
    </div>
  )
}
