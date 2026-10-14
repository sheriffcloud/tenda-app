import { act, render, screen } from '@testing-library/react'
// Aliased: this is the SETUP MOCK's accessor, not a hook call.
import { useRouter as routerMockAccessor } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: { auth: { verify: vi.fn(), me: vi.fn(), methods: vi.fn() }, users: {} },
}))

import { AuthGate } from '@/components/app/AuthGate'
import { useAuthStore } from '@/stores/auth.store'
import { RETURN_PARAM } from '@/lib/auth/return-path'

/** jsdom keeps a real History, so this is how a deep link is expressed. */
function visiting(path: string) {
  window.history.replaceState({}, '', path)
}

const router = vi.mocked(routerMockAccessor())

beforeEach(() => {
  window.localStorage.clear()
  visiting('/home')
  useAuthStore.setState({
    user: null,
    jwt: null,
    isAuthenticated: false,
    isLoading: true,
    profileComplete: null,
    identities: [],
  })
})

describe('AuthGate', () => {
  it('shows a skeleton while the session bootstraps', async () => {
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    // The gate's own bootstrap settles after the assertion; flushed here so it
    // lands inside act rather than in whichever test runs next.
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('redirects an unauthenticated visitor to /signin', async () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: false })
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    // Heading for the default, so no param: the commonest redirect stays clean.
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signin'))
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('carries the DEEP LINK they were heading for through to sign-in', async () => {
    // The whole point of #27: a shared /my-gigs/<escrowId> link must survive
    // the sign-in it forces, query string and all.
    visiting('/my-gigs/esc-1?tab=proofs')
    useAuthStore.setState({ isLoading: false, isAuthenticated: false })
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        `/signin?${RETURN_PARAM}=%2Fmy-gigs%2Fesc-1%3Ftab%3Dproofs`,
      ),
    )
  })

  it('hands the destination on to the onboarding WAYPOINT', async () => {
    // An incomplete profile is a step on the way, not the end of the journey.
    visiting(`/my-gigs/esc-1?${RETURN_PARAM}=%2Fmy-gigs%2Fesc-1`)
    useAuthStore.setState({ isLoading: false, isAuthenticated: true, profileComplete: false })
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        `/onboarding/profile?${RETURN_PARAM}=%2Fmy-gigs%2Fesc-1`,
      ),
    )
  })

  it('routes an incomplete profile to onboarding', async () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: true, profileComplete: false })
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/profile'))
  })

  it('renders children for a complete session', () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: true, profileComplete: true })
    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
