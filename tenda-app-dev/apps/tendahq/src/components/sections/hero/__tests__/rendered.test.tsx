import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EscrowReceipt } from '../EscrowReceipt'
import { ESCROW_PANEL } from '../content'

/**
 * The receipt places its stops in TypeScript and moves its pip in CSS, and
 * the two only line up if they agree on where the track starts and ends.
 * Nothing in the type system spans that seam, so this reads the keyframe
 * out of the stylesheet and checks the rendered stops against it.
 */
const html = renderToStaticMarkup(<EscrowReceipt />)
const css = readFileSync(join(__dirname, '../../../../styles/components.css'), 'utf8')

function pipRange(): [number, number] {
  const block = css.match(/@keyframes stage-pip \{([^}]*\}[^}]*)*?\n\}/)
  if (block === null) throw new Error('stage-pip keyframe not found in components.css')
  const lefts = [...block[0].matchAll(/left:\s*(\d+)%/g)].map((m) => Number(m[1]))
  return [lefts[0], lefts[lefts.length - 1]]
}

describe('the hero receipt stage line', () => {
  it('puts the first and last stop exactly where the pip starts and ends', () => {
    const [first, last] = pipRange()
    expect(first).toBeLessThan(last)
    const stops = [...html.matchAll(/class="stop" style="left:([\d.]+)%"/g)].map((m) => Number(m[1]))
    expect(stops).toHaveLength(ESCROW_PANEL.stages.length)
    expect(stops[0]).toBe(first)
    expect(stops[stops.length - 1]).toBe(last)
  })

  it('spaces the stops evenly, in the order the contract walks them', () => {
    const stops = [...html.matchAll(/class="stop" style="left:([\d.]+)%"/g)].map((m) => Number(m[1]))
    const gaps = stops.slice(1).map((s, i) => s - stops[i])
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)
    for (const [i, stage] of ESCROW_PANEL.stages.entries()) {
      expect(html.indexOf(`>${stage}<`)).toBeGreaterThan(-1)
      if (i > 0) expect(html.indexOf(`>${stage}<`)).toBeGreaterThan(html.indexOf(`>${ESCROW_PANEL.stages[i - 1]}<`))
    }
  })

  it('names every row for assistive tech and hides the decorative line', () => {
    for (const row of ESCROW_PANEL.rows) expect(html).toContain(`${row.label} ${row.value}`)
    expect(html).toContain('aria-hidden="true" class="stage-line"')
  })
})
