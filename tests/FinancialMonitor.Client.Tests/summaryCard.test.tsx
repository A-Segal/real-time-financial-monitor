import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SummaryCard from '../../client/src/components/SummaryCard'

afterEach(() => cleanup())

describe('SummaryCard', () => {
  it('renders label and value', () => {
    render(<SummaryCard label="Total Transactions" value={42} />)
    expect(screen.getByText('Total Transactions')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders zero value correctly', () => {
    render(<SummaryCard label="Pending" value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('applies the default accent class by default', () => {
    const { container } = render(<SummaryCard label="Total" value={5} />)
    const article = container.querySelector('.summary-card')
    expect(article?.className).toContain('summary-card--default')
  })

  it.each(['pending', 'completed', 'failed'] as const)(
    'applies the %s accent class',
    (accent) => {
      const { container } = render(<SummaryCard label="Test" value={3} accent={accent} />)
      const article = container.querySelector('.summary-card')
      expect(article?.className).toContain(`summary-card--${accent}`)
    },
  )

  it('renders as an article element', () => {
    const { container } = render(<SummaryCard label="Completed" value={10} />)
    expect(container.querySelector('article')).toBeInTheDocument()
  })

  it('displays the value as text, not an input', () => {
    render(<SummaryCard label="Failed" value={2} />)
    const value = screen.getByText('2')
    expect(value.tagName).toBe('P')
  })
})
