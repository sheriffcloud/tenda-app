import { render, screen } from '@testing-library/react'
import { useRouter as routerMockAccessor } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: { auth: { me: vi.fn(), verify: vi.fn(), methods: vi.fn() }, users: {} },
}))

import { GuestOnlyGate } from '@/components/app/GuestOnlyGate'
import { useAuthStore } from '@/stores/auth.store'

const router = vi.mocked(routerMockAccessor())

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  useAuthStore.setState({
    user: null,
    jwt: null,
    isLoading: false,
    isAuthenticated: false,
    profileComplete: null,
    identities: [],
  })
})

describe('GuestOnlyGate', () => {
  it('renders sign-in content for a signed-out visitor', () => {
    render(<GuestOnlyGate><p>Sign in</p></GuestOnlyGate>)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('redirects a complete session home without blanking the current heading', async () => {
    useAuthStore.setState({ isAuthenticated: true, profileComplete: true })
    render(<GuestOnlyGate><p>Sign in</p></GuestOnlyGate>)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'))
  })

  it('sends an incomplete session to profile onboarding', async () => {
    window.history.replaceState({}, '', '/signin?next=%2Fmy-gigs%2Fesc-1')
    useAuthStore.setState({ isAuthenticated: true, profileComplete: false })
    render(<GuestOnlyGate><p>Sign in</p></GuestOnlyGate>)
    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/profile?next=%2Fmy-gigs%2Fesc-1'),
    )
  })
})
