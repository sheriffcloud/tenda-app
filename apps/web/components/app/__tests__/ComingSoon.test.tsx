import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from '@/components/app/ComingSoon'

describe('ComingSoon', () => {
  it('names the surface and the stage it arrives with', () => {
    render(<ComingSoon title="Wallet" stage={3} blurb="Balances across chains." />)
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.getByText('Balances across chains.')).toBeInTheDocument()
    expect(screen.getByText('Arrives with Stage 3')).toBeInTheDocument()
  })
})
