import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { applyTheme, THEME_STORAGE_KEY } from '@/lib/theme'

beforeEach(() => {
  applyTheme('system')
})

describe('ThemeToggle', () => {
  it('system (light-matching) → dark on first toggle', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByLabelText('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('dark → light on the next toggle', async () => {
    applyTheme('dark')
    render(<ThemeToggle />)
    await userEvent.click(screen.getByLabelText('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('labels the action from the effective system theme', () => {
    let notify: (() => void) | undefined
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, listener: EventListener) => {
        notify = () => listener(new Event('change'))
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } satisfies MediaQueryList)

    render(<ThemeToggle showLabel />)

    expect(screen.getByRole('button', { name: 'Toggle theme' }).textContent).toContain('Light mode')

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } satisfies MediaQueryList)
    act(() => notify?.())
    expect(screen.getByRole('button', { name: 'Toggle theme' }).textContent).toContain('Dark mode')
  })
})
