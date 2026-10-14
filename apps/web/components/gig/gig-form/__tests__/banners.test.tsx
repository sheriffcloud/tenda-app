/**
 * The advisory banners: AddFundsNudge's "known and short" visibility rule
 * (unknown is NEVER an accusation), the cross-border banner, and the
 * moderation hint's decision branches.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ModerationPreviewResponse } from '@tenda/shared'

const { balanceState } = vi.hoisted(() => ({
  balanceState: { current: null as { amountRaw: string } | null },
}))
vi.mock('@/hooks/wallet/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ balance: balanceState.current, status: 'ready', refresh: vi.fn() }),
}))

import { AddFundsNudge } from '@/components/gig/gig-form/AddFundsNudge'
import { CrossBorderBanner } from '@/components/gig/gig-form/CrossBorderBanner'
import { ModerationHint } from '@/components/gig/gig-form/ModerationHint'

beforeEach(() => {
  balanceState.current = null
})

const NUDGE = /balance won.t cover/

test('AddFundsNudge shows only when the balance is KNOWN and short, linking to /wallet', () => {
  balanceState.current = { amountRaw: '5000000' }
  render(<AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="10000000" />)
  const link = screen.getByRole('link', { name: NUDGE })
  expect(link).toHaveAttribute('href', '/wallet')
})

test('a covered budget shows nothing', () => {
  balanceState.current = { amountRaw: '10000000' }
  const { container } = render(
    <AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="10000000" />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('an UNKNOWN balance stays silent — an RPC failure never accuses the user', () => {
  balanceState.current = null
  const { container } = render(
    <AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="10000000" />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('an unparseable balance or budget also stays silent', () => {
  // Both halves, because the name promises both and only the balance half was
  // ever checked. The budget half became reachable when paymentRaw stopped
  // being a number: a malformed amount_raw from a draft now arrives as a
  // non-canonical string, and BigInt() throws on it — an advisory hint must
  // never take the form down.
  balanceState.current = { amountRaw: 'not-a-number' }
  const { container } = render(
    <AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="10000000" />,
  )
  expect(container).toBeEmptyDOMElement()

  balanceState.current = { amountRaw: '5000000' }
  expect(() =>
    render(<AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="not-a-number" />),
  ).not.toThrow()
  expect(screen.queryByRole('link', { name: NUDGE })).toBeNull()
})

test('an EMPTY budget shows nothing — nothing has been asked for yet', () => {
  // '' is the new "not set". A short balance must not accuse someone who has
  // not typed an amount.
  balanceState.current = { amountRaw: '1' }
  const { container } = render(
    <AddFundsNudge chainId="solana:devnet" asset="USDC_SOL" paymentRaw="" />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('CrossBorderBanner shows for a different work country, names it, silent otherwise', () => {
  const { container, rerender } = render(
    <CrossBorderBanner remote={false} country="KE" homeCountry="NG" assetSymbol="USDC" />,
  )
  expect(screen.getByText(/Cross-border posting/)).toBeInTheDocument()
  expect(container.textContent).toMatch(/Kenya/)

  rerender(<CrossBorderBanner remote={false} country="NG" homeCountry="NG" assetSymbol="USDC" />)
  expect(container).toBeEmptyDOMElement()
  rerender(<CrossBorderBanner remote country="KE" homeCountry="NG" assetSymbol="USDC" />)
  expect(container).toBeEmptyDOMElement()
})

test('ModerationHint renders warn and block tones, nothing on approve/null', () => {
  const warn: ModerationPreviewResponse = {
    decision: 'warn',
    reasons: [{ code: 'price', message: 'That budget looks low for this category.', severity: 'warn' }],
    cached: false,
  }
  const { container, rerender } = render(<ModerationHint moderation={warn} />)
  expect(screen.getByText('That budget looks low for this category.')).toBeInTheDocument()

  rerender(<ModerationHint moderation={{ ...warn, decision: 'block' }} />)
  expect(screen.getByRole('status').className).toMatch(/danger/)

  rerender(<ModerationHint moderation={{ decision: 'approve', reasons: [], cached: false }} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<ModerationHint moderation={null} />)
  expect(container).toBeEmptyDOMElement()
})
