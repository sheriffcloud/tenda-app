/**
 * Harness proof (#99): confirms the jsdom + React Testing Library +
 * jest-dom + Next-router-mock stack renders a client component and that
 * the next/navigation shim is wired. Not a product test — it guards the
 * tooling so real component tests (#100) have a known-good baseline.
 */
import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'

function Probe() {
  const router = useRouter()
  return (
    <button type="button" onClick={() => router.push('/disputes')}>
      Go to disputes
    </button>
  )
}

test('RTL renders a client component into jsdom and jest-dom matchers work', () => {
  render(<Probe />)
  expect(screen.getByRole('button', { name: 'Go to disputes' })).toBeInTheDocument()
})

test('the next/navigation mock provides a callable router', () => {
  expect(typeof useRouter().push).toBe('function')
})
