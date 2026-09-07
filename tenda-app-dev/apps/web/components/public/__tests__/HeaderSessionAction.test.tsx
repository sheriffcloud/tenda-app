import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSessionAction } from '@/components/public/HeaderSessionAction'
import { JWT_TOKEN_KEY } from '@/lib/storage'

beforeEach(() => {
  window.localStorage.clear()
})

describe('HeaderSessionAction', () => {
  it('offers Sign in to a visitor', async () => {
    render(<HeaderSessionAction />)
    await vi.waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin')
    })
  })

  it('offers Home once a token exists — we are already IN the app', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-1')
    render(<HeaderSessionAction />)
    // `screen.findByRole`, not `vi.waitFor`: vitest's waitFor does not wrap its
    // polling in `act`, so the token read settled outside React's scope and
    // warned. RTL's async queries do.
    expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home')
  })
})
