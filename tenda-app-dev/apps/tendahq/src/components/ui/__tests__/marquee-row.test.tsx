import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MarqueeRow } from '../MarqueeRow'

/**
 * The marquee promises reduced-motion visitors a static, scrollable row.
 * The hook is a media query; what it decides is what is under test.
 */
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))

const ITEMS = ['alpha', 'beta', 'gamma'] as const
const render = (reduced: boolean) => {
  motion.reduced = reduced
  return renderToStaticMarkup(
    <MarqueeRow items={ITEMS} keyOf={(s) => s} direction="left" speedSec={40} renderItem={(s) => <b>{s}</b>} />,
  )
}
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('MarqueeRow', () => {
  it('doubles the items and animates the track when motion is allowed', () => {
    const html = render(false)
    for (const item of ITEMS) expect(count(html, `<b>${item}</b>`)).toBe(2)
    expect(html).toContain('animation-name:marquee-x')
    expect(html).toContain(`animation-duration:40s`)
  })

  it('renders each item once, unanimated and scrollable, under reduced motion', () => {
    const html = render(true)
    for (const item of ITEMS) expect(count(html, `<b>${item}</b>`)).toBe(1)
    expect(html).not.toContain('animation-name')
    expect(html).toContain('overflow-x-auto')
  })

  it('runs the reverse keyframe for the other direction', () => {
    motion.reduced = false
    const html = renderToStaticMarkup(
      <MarqueeRow items={ITEMS} keyOf={(s) => s} direction="right" speedSec={12} renderItem={(s) => <i>{s}</i>} />,
    )
    expect(html).toContain('animation-name:marquee-x-reverse')
  })
})
