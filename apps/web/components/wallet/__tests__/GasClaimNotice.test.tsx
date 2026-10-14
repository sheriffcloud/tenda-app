/**
 * Web's half of the gas claim (#53c-2): tell the user the grant exists, and
 * that it is claimed in the app.
 *
 * The properties worth pinning are about what it must NOT do. It must not offer
 * a control that the server would refuse, and it must not appear as a standing
 * advertisement — only when this user genuinely has a grant waiting, which the
 * server marks with the `mobile_only` reason.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { GasSeedAvailability } from '@tenda/shared'
import { GasClaimNotice } from '../GasClaimNotice'
import { WALLET_COPY } from '../copy'

const availability = vi.fn()
vi.mock('@/api/client', () => ({
  api: { wallet: { gasSeedAvailability: () => availability() } },
}))

function offer(over: Partial<GasSeedAvailability> = {}): GasSeedAvailability {
  return {
    chain_id: 'eip155:16661',
    available: false,
    amount_raw: '10000000000000000',
    state: 'unclaimed',
    reason: 'mobile_only',
    ...over,
  }
}

beforeEach(() => {
  availability.mockReset()
})

it('names the grant and points at the app when one is waiting', async () => {
  availability.mockResolvedValue({ chains: [offer()] })
  render(<GasClaimNotice />)

  expect(await screen.findByText(WALLET_COPY.gasClaimTitle)).toBeInTheDocument()
  expect(screen.getByText(WALLET_COPY.gasClaimInApp)).toBeInTheDocument()
})

it('offers NO control — not even a disabled one', async () => {
  // A button here would either lie about what web can do, or invite a click
  // that the server refuses. The point is to inform, then get out of the way.
  availability.mockResolvedValue({ chains: [offer()] })
  render(<GasClaimNotice />)

  await screen.findByText(WALLET_COPY.gasClaimTitle)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
})

it('says nothing when the only refusals are ones web cannot help with', async () => {
  // `funder_empty` is an operations problem and `phone_required` is something
  // the app says better in context. Rendering either here would be a permanent
  // apology on a screen about balances.
  availability.mockResolvedValue({
    chains: [offer({ reason: 'funder_empty' }), offer({ reason: 'phone_required' })],
  })
  const { container } = render(<GasClaimNotice />)

  await waitFor(() => expect(availability).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

it('says nothing about a grant already claimed or under way', async () => {
  // The balance grid above is the honest place for a grant that has landed.
  availability.mockResolvedValue({
    chains: [offer({ state: 'claimed', reason: 'already_granted' })],
  })
  const { container } = render(<GasClaimNotice />)

  await waitFor(() => expect(availability).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

it('a failed read renders nothing rather than an error about an offer', async () => {
  availability.mockRejectedValue(new Error('offline'))
  const { container } = render(<GasClaimNotice />)

  await waitFor(() => expect(availability).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

describe('the copy it renders', () => {
  it('tells the reader WHERE to claim and WHICH wallet is paid', () => {
    // Both facts, because a notice that says only "use the app" leaves the
    // reader wondering which of their wallets it would land in.
    expect(WALLET_COPY.gasClaimInApp).toMatch(/app/i)
    expect(WALLET_COPY.gasClaimInApp).toMatch(/wallet you sign with/i)
  })
})
