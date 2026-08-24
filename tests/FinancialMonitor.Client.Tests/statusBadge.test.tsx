import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatusBadge from '../../client/src/components/StatusBadge'

afterEach(() => cleanup())

describe('StatusBadge', () => {
  it('renders Pending status with correct text and icon', () => {
    render(<StatusBadge status="Pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    // The icon element has aria-hidden="true"
    const icon = screen.getByText('●')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders Completed status with checkmark icon', () => {
    render(<StatusBadge status="Completed" />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('renders Failed status with X icon', () => {
    render(<StatusBadge status="Failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('applies the correct CSS class for the status', () => {
    const { container } = render(<StatusBadge status="Completed" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('status-badge--completed')
  })

  it('applies animating class when animating prop is true', () => {
    const { container } = render(<StatusBadge status="Pending" animating={true} />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('status-badge--animating')
  })

  it('does not apply animating class when animating prop is false', () => {
    const { container } = render(<StatusBadge status="Pending" animating={false} />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).not.toContain('status-badge--animating')
  })

  it('applies previous status class during animation', () => {
    // Render with Pending first, then re-render with Completed + animating
    const { container, rerender } = render(<StatusBadge status="Pending" />)
    rerender(<StatusBadge status="Completed" animating={true} />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('status-badge--from-pending')
  })

  it('calls onAnimationEnd when animation completes', () => {
    const onAnimationEnd = vi.fn()
    const { container } = render(
      <StatusBadge status="Completed" animating={true} onAnimationEnd={onAnimationEnd} />
    )
    const badge = container.firstChild as HTMLElement
    // jsdom does not support AnimationEvent, so use fireEvent
    fireEvent.animationEnd(badge)
    expect(onAnimationEnd).toHaveBeenCalledTimes(1)
  })

  it('handles status change detection correctly', async () => {
    // When status changes, the component should track previous status
    const { container, rerender } = render(<StatusBadge status="Pending" />)
    // First render - no previous status
    expect((container.firstChild as HTMLElement).className).not.toContain('status-badge--from-')

    // Change status — the useEffect that sets previousStatus runs after commit,
    // so we need to waitFor it to flush.
    rerender(<StatusBadge status="Completed" animating={true} />)
    await waitFor(() => {
      expect((container.firstChild as HTMLElement).className).toContain('status-badge--from-pending')
    })
  })

  it('does not add previous status class when status remains the same', () => {
    const { container, rerender } = render(<StatusBadge status="Pending" />)
    rerender(<StatusBadge status="Pending" animating={true} />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).not.toContain('status-badge--from-')
  })
})
