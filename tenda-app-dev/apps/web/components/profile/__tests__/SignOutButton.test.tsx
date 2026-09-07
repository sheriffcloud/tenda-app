import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Aliased: this is the SETUP MOCK's accessor, not a hook call.
import { useRouter as routerMockAccessor } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn(), ToastHost: () => null }))

import { SignOutButton } from '@/components/profile'
import { showToast } from '@/components/ui/Toast'
import { useAuthStore } from '@/stores/auth.store'

const router = vi.mocked(routerMockAccessor())

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignOutButton', () => {
  it('ends the session and sends the reader to the public feed', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({ logout })
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(logout).toHaveBeenCalledOnce()
    // replace(), not push(): a signed-out reader must not be able to go BACK
    // into the authed surface they just left.
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('redirects only after logout resolves', async () => {
    const order: string[] = []
    useAuthStore.setState({
      logout: vi.fn().mockImplementation(async () => {
        order.push('logout')
      }),
    })
    vi.mocked(router.replace).mockImplementation(() => {
      order.push('replace')
    })
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(order).toEqual(['logout', 'replace'])
  })

  it('collapses a double click into one sign-out (the disabled state does it)', async () => {
    let release: (() => void) | undefined
    const logout = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    useAuthStore.setState({ logout })
    render(<SignOutButton />)
    const button = screen.getByRole('button', { name: /Sign/ })

    await userEvent.click(button)
    await userEvent.click(button)
    // Releasing the pending logout re-enables the button — a state update, so
    // it is flushed here rather than landing after the test.
    await act(async () => {
      release?.()
    })

    expect(logout).toHaveBeenCalledOnce()
  })

  it('shows progress while the request is in flight', async () => {
    useAuthStore.setState({
      logout: vi.fn().mockImplementation(() => new Promise<void>(() => {})),
    })
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Signing out' })).toBeDisabled()
  })

  it('reports a failed sign-out and re-enables itself, without an unhandled rejection', async () => {
    useAuthStore.setState({ logout: vi.fn().mockRejectedValue(new Error('offline')) })
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    // Told the reader…
    expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('Could not sign out'))
    // …left them able to retry…
    expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeDisabled()
    // …and did NOT strand them on a page that thinks they are signed out.
    expect(router.replace).not.toHaveBeenCalled()
  })
})
