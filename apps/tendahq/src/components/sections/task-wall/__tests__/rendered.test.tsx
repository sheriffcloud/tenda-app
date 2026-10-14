import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SURFACE_TOKEN } from '@/components/ui/surface'
import { CATEGORIES, EXAMPLE_TASKS, GIG_ASSET_SYMBOL, GIG_CATEGORIES } from '@/content'
import { TaskWall } from '../TaskWall'
import { TASK_WALL_HEADER } from '../content'

/**
 * The ticker's edge fades must dissolve into the ground the section actually
 * sits on. The section cannot know that ground — the page derives it from
 * position (#55) — so it forwards the token it was handed. Pinning one token
 * in the stylesheet passed every test while the section happened to sit at an
 * odd index, and would have drawn an alt-coloured smear on a base ground the
 * day a section was inserted above it.
 */
describe('§02 tasks wall', () => {
  it('fades the ticker into the ground it was handed, at either surface', () => {
    for (const surface of ['base', 'alt'] as const) {
      const html = renderToStaticMarkup(<TaskWall surface={surface} />)
      expect(html).toContain(`--tick-ground:var(${SURFACE_TOKEN[surface]})`)
    }
  })

  it('does not pin the other surface’s ground', () => {
    const html = renderToStaticMarkup(<TaskWall surface="base" />)
    expect(html).not.toContain(`--tick-ground:var(${SURFACE_TOKEN.alt})`)
  })

  it('renders every showcased gig with the gig asset symbol, across both lanes', () => {
    const html = renderToStaticMarkup(<TaskWall surface="alt" />)
    for (const task of EXAMPLE_TASKS) {
      expect(html).toContain(task.title)
      expect(html).toContain(`${task.amountUsdc} ${GIG_ASSET_SYMBOL}`)
    }
  })

  it('closes on one chip per shared category, then the live markets note', () => {
    const html = renderToStaticMarkup(<TaskWall surface="alt" />)
    for (const id of GIG_CATEGORIES) {
      expect(html).toContain(`${CATEGORIES[id].emoji} ${CATEGORIES[id].label}`)
    }
    expect(html).toContain(TASK_WALL_HEADER.marketsNote)
    expect(html).toContain(TASK_WALL_HEADER.eyebrow)
  })
})
