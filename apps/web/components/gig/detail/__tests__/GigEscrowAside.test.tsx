/**
 * The sticky money column. `GigDetailApp` is stubbed on purpose: its own
 * suite covers the session swap, and what matters HERE is which fields the
 * aside hands it — client-component props are serialised into the anonymous
 * HTML, so the allowlist is a disclosure boundary, not a convenience.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  chainLabel,
  escrowFeeBreakdown,
  formatAssetAmount,
  splitAssetAmount,
  type GigDetail,
} from '@tenda/shared'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import type { PublicGigCta } from '@/components/gig/GigDetailCta'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { LEAKED_COUNTERPARTY_ID, deliveryGigDetail } from '@/e2e/fixtures/gigs'

const { capturedInitial } = vi.hoisted(() => ({
  capturedInitial: { current: null as PublicGigCta | null },
}))

vi.mock('@/components/gig/detail/GigDetailApp', () => ({
  GigDetailApp: ({ initial }: { initial: PublicGigCta & Pick<GigDetail, 'escrow_id'> }) => {
    capturedInitial.current = initial
    return <button type="button">Sign in to accept</button>
  },
}))

const { GigEscrowAside } = await import('@/components/gig/detail/GigEscrowAside')

const gig = deliveryGigDetail

describe('GigEscrowAside', () => {
  it('shows the gross funded amount as one figure, split from ONE formatter', () => {
    render(<GigEscrowAside gig={gig} />)
    const { amount, symbol } = splitAssetAmount(gig.amount_raw, gig.asset)
    expect(screen.getByText(amount)).toBeInTheDocument()
    expect(screen.getByText(symbol)).toBeInTheDocument()
    // …and read as one amount in plain text (see GigCard).
    expect(document.body.textContent).toContain(`${amount} ${symbol}`)
  })

  it('does not falsely claim the gross amount is the worker payout while config loads', () => {
    render(<GigEscrowAside gig={gig} />)
    expect(screen.getByText(GIG_DETAIL_COPY.feePending)).toBeInTheDocument()
    expect(screen.queryByText(/fee is already taken out/i)).not.toBeInTheDocument()
  })

  it('once config lands, states the worker NET through the shared breakdown', () => {
    // Settlement-amount honesty: the sentence must be the one projection the
    // shared fee math produces, fee percentage included — asserted through the
    // same function, so a forked figure here fails rather than drifts.
    const config = { fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 3600 }
    usePlatformConfigStore.setState({ config })
    try {
      render(<GigEscrowAside gig={gig} />)
      const { netRaw, feePct } = escrowFeeBreakdown(config, gig.is_seeker, gig.amount_raw)
      if (netRaw === null || feePct === null) throw new Error('breakdown must be loaded here')
      expect(
        screen.getByText(
          GIG_DETAIL_COPY.workerReceives(formatAssetAmount(netRaw.toString(), gig.asset), feePct),
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(GIG_DETAIL_COPY.feePending)).not.toBeInTheDocument()
      // NOT via the copy function (that comparison would track a copy
      // mutation): the rendered sentence must carry the tier's percentage.
      expect(document.body.textContent).toContain(`${feePct}%`)
    } finally {
      usePlatformConfigStore.setState({ config: null })
    }
  })

  it('names the ticker ONCE in the payout sentence (#65) — the exact words a reader sees', () => {
    // Asserted as a LITERAL, not through the copy function or the formatter:
    // the copy took a symbol the formatter had already rendered, and every
    // assertion that went through either passed on "24.375 USDC USDC".
    // 25 USDC at the 2.50% tier: 25 − 0.625.
    usePlatformConfigStore.setState({ config: { fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 3600 } })
    try {
      render(<GigEscrowAside gig={gig} />)
      expect(
        screen.getByText('Worker receives 24.375 USDC after the 2.50% platform fee.'),
      ).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/USDC\s+USDC/)
    } finally {
      usePlatformConfigStore.setState({ config: null })
    }
  })

  it('names the chain through the shared label, never the CAIP-2 id', () => {
    render(<GigEscrowAside gig={gig} />)
    expect(
      screen.getByText(GIG_DETAIL_COPY.lockedOn(chainLabel(gig.chain_id))),
    ).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(gig.chain_id))).not.toBeInTheDocument()
  })

  it('hands the action island the public allowlist and NOTHING else', () => {
    render(<GigEscrowAside gig={gig} />)
    expect(capturedInitial.current).toEqual({
      escrow_id: gig.escrow_id,
      status: gig.status,
      is_assigned: gig.is_assigned,
      requires_approval: gig.requires_approval,
      accept_deadline: gig.accept_deadline,
    })
  })

  it('uses supplied workspace actions instead of mounting the public session island', () => {
    capturedInitial.current = null
    render(<GigEscrowAside gig={gig} actions={<button type="button">Workspace action</button>} />)
    expect(screen.getByRole('button', { name: 'Workspace action' })).toBeInTheDocument()
    expect(capturedInitial.current).toBeNull()
  })

  it('never serialises a party-scoped field into the anonymous HTML', () => {
    // The fixture is a HOSTILE server: it serves the counterparty anyway.
    const { container } = render(<GigEscrowAside gig={gig} />)
    expect(JSON.stringify(capturedInitial.current)).not.toContain(LEAKED_COUNTERPARTY_ID)
    expect(container.innerHTML).not.toContain(LEAKED_COUNTERPARTY_ID)
  })

  it('carries the settlement steps, keyed to the acceptance mode', () => {
    const { unmount } = render(<GigEscrowAside gig={gig} />)
    expect(screen.getByText(GIG_DETAIL_COPY.settleSteps.accept)).toBeInTheDocument()
    unmount()

    render(<GigEscrowAside gig={{ ...gig, requires_approval: true }} />)
    expect(screen.getByText(GIG_DETAIL_COPY.settleSteps.apply)).toBeInTheDocument()
  })
})
