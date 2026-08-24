import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Entry from '../../client/src/pages/Entry'

afterEach(() => cleanup())

describe('Home page (Entry)', () => {
  it('renders the money bag image', () => {
    render(<Entry onNavigate={vi.fn()} />)
    const img = screen.getByAltText('')
    expect(img).toHaveAttribute('src', '/money-bag.png')
    expect(img).toHaveAttribute('width', '90')
    expect(img).toHaveAttribute('height', '90')
  })

  it('renders all required heading text', () => {
    render(<Entry onNavigate={vi.fn()} />)
    expect(screen.getByText('FINANCIAL SYSTEM')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Financial Monitor' })).toBeInTheDocument()
    expect(screen.getByText('Real-time transaction monitoring')).toBeInTheDocument()
  })

  it('renders the Monitor card with description', () => {
    render(<Entry onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /MONITOR/ })).toBeInTheDocument()
    expect(screen.getByText('View and monitor transactions in real time.')).toBeInTheDocument()
  })

  it('renders the Add Transaction card with description', () => {
    render(<Entry onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /ADD TRANSACTION/ })).toBeInTheDocument()
    expect(screen.getByText('Create and send a new transaction.')).toBeInTheDocument()
  })

  it('renders the footer text', () => {
    render(<Entry onNavigate={vi.fn()} />)
    expect(screen.getByText('REAL-TIME FINANCIAL MONITOR')).toBeInTheDocument()
  })

  it('navigates to monitor when Monitor card is clicked', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Entry onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /MONITOR/ }))
    expect(onNavigate).toHaveBeenCalledWith('monitor')
  })

  it('navigates to add when Add Transaction card is clicked', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Entry onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /ADD TRANSACTION/ }))
    expect(onNavigate).toHaveBeenCalledWith('add')
  })
})
