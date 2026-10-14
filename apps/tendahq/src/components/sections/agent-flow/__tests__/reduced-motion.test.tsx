import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FLOW_LANES } from '@/content/agent-flow'
import { AgentFlow } from '../AgentFlow'
import { PLAY_LABELS } from '../content'

/**
 * Under reduced motion the loop holds its FINISHED frame: freezing on step
 * one would hide five of six steps from exactly the people least able to
 * wait for a reveal. The rule lives in the timeline hook, which the static
 * render runs, so it is decidable here with the media query mocked.
 */
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }))

const html = renderToStaticMarkup(<AgentFlow surface="base" />)
const [HUMAN] = FLOW_LANES

describe('the hire loop under reduced motion', () => {
  it('holds the settled frame: the last step lit, the money released', () => {
    const lit = [...html.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1].includes('opacity-100'))
    expect(lit).toHaveLength(HUMAN.steps.length)
    expect(lit[lit.length - 1]).toBe(true)
    expect(lit.slice(0, -1).every((on) => !on)).toBe(true)
    expect(html).toContain('data-state="released"')
  })

  it('offers play rather than pause, since nothing is running', () => {
    expect(html).toContain(`aria-label="${PLAY_LABELS.play}"`)
    expect(html).not.toContain(`aria-label="${PLAY_LABELS.pause}"`)
  })
})
