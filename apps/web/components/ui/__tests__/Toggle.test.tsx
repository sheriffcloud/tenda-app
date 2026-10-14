/**
 * ui/Toggle — the switch primitive. Positive: it is an accessible
 * role="switch" that reports the flipped value. Negative: disabled swallows
 * the click, and presentational mode renders NO control at all (the parent
 * card owns the switch role — two nested switches would be invalid DOM).
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Toggle } from '@/components/ui/Toggle'

describe('Toggle', () => {
  it('renders an accessible switch and flips the value on click', () => {
    const onChange = vi.fn()
    render(<Toggle value={false} onChange={onChange} label="Remote" />)
    const control = screen.getByRole('switch', { name: 'Remote' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)

    cleanup()
    render(<Toggle value={true} onChange={onChange} label="Remote" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Remote' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('disabled swallows the click', () => {
    const onChange = vi.fn()
    render(<Toggle value={false} onChange={onChange} label="Remote" disabled />)
    fireEvent.click(screen.getByRole('switch', { name: 'Remote' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('presentational mode renders no interactive control', () => {
    render(<Toggle value={true} label="Remote" presentational />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
