import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FEE_PCT } from '@/content'
import { asText } from '@/test-support/html-text'
import { HeroStatRow } from '../HeroStatRow'
import { FEE_STAT_INDEX, HERO_STATS_FALLBACK } from '../content'

/** The hook is a network effect; which cell it reaches is what is under test. */
const fee = vi.hoisted(() => ({
  state: { posterFeePct: null as number | null, seekerFeePct: null as number | null },
}))
vi.mock('@/hooks/usePlatformConfig', () => ({ useFeePercents: () => fee.state }))

const render = (posterFeePct: number | null) => {
  fee.state = { posterFeePct, seekerFeePct: null }
  return renderToStaticMarkup(<HeroStatRow />)
}

const feeCell = HERO_STATS_FALLBACK[FEE_STAT_INDEX]
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A value beside its own label: the cell, not merely the string somewhere. */
const cell = (html: string, value: string, label: string) =>
  new RegExp(`>${literal(asText(value))}</span><span[^>]*>${literal(label)}<`).test(html)

describe('the hero stat row', () => {
  it('prints the configured default while the live fee is unknown', () => {
    const html = render(null)
    for (const stat of HERO_STATS_FALLBACK) expect(cell(html, stat.value, stat.label)).toBe(true)
  })

  it('swaps the live fee into the fee cell and nowhere else', () => {
    const live = Number(FEE_PCT) + 1.25
    const html = render(live)
    expect(cell(html, `${live}%`, feeCell.label)).toBe(true)
    expect(cell(html, feeCell.value, feeCell.label)).toBe(false)
    for (const [i, stat] of HERO_STATS_FALLBACK.entries()) {
      if (i !== FEE_STAT_INDEX) expect(cell(html, stat.value, stat.label)).toBe(true)
    }
  })

  it('treats a genuinely free platform as 0%, not as unknown', () => {
    expect(cell(render(0), '0%', feeCell.label)).toBe(true)
  })
})
