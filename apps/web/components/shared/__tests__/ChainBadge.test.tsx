import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CHAIN_GLYPH_INK, chainDisplay, chainLabel } from '@tenda/shared'
import { CHAIN_BADGE_FALLBACK_COLOR, ChainBadge } from '@/components/shared/ChainBadge'

const SOLANA = 'solana:devnet'
const BASE = 'eip155:84532'
const CELO = 'eip155:11142220'

describe('ChainBadge', () => {
  it('names the chain through the shared label — never the CAIP-2 id', () => {
    render(<ChainBadge chainId={SOLANA} />)
    expect(screen.getByText(chainLabel(SOLANA))).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(SOLANA)
  })

  it('paints the disc in the chain’s OWN brand colour with the ink shared picked for it', () => {
    const { container, unmount } = render(<ChainBadge chainId={BASE} />)
    const base = chainDisplay(BASE)
    const disc = container.querySelector('[aria-hidden]')
    expect(disc).toHaveStyle({ background: base.color ?? '' })
    expect(disc).toHaveStyle({ color: CHAIN_GLYPH_INK.light })
    expect(disc).toHaveTextContent(base.glyph)
    unmount()
    // Yellow takes the dark ink; a badge that hardcoded white would be
    // unreadable on Celo.
    const celo = render(<ChainBadge chainId={CELO} />).container.querySelector('[aria-hidden]')
    expect(celo).toHaveStyle({ color: CHAIN_GLYPH_INK.dark })
  })

  it('draws two chains of two families with DIFFERENT discs', () => {
    const solana = chainDisplay(SOLANA)
    const base = chainDisplay(BASE)
    expect(solana.color).not.toBe(base.color)
    expect(solana.glyph).not.toBe(base.glyph)
  })

  it('falls back to the brand colour and "Unknown" for an id the manifest lacks', () => {
    const { container } = render(<ChainBadge chainId="eip155:999999" />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden]')).toHaveStyle({
      background: CHAIN_BADGE_FALLBACK_COLOR,
    })
  })

  it('glyph-only still SAYS the chain: an image named by the label', () => {
    render(<ChainBadge chainId={SOLANA} glyphOnly />)
    const badge = screen.getByRole('img', { name: chainLabel(SOLANA) })
    expect(badge).toHaveAttribute('title', chainLabel(SOLANA))
    // The label is not rendered as text twice.
    expect(badge.textContent).toBe(chainDisplay(SOLANA).glyph)
  })

  it('a labelled badge has no image role — its text is its name', () => {
    render(<ChainBadge chainId={SOLANA} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('exposes the chain id as data for a test or a style hook, and takes a className', () => {
    const { container } = render(<ChainBadge chainId={SOLANA} size="sm" className="ml-1" />)
    const badge = container.querySelector(`[data-chain-badge="${SOLANA}"]`)
    expect(badge).not.toBeNull()
    expect(badge?.className).toContain('h-5')
    expect(badge?.className).toContain('ml-1')
  })
})
