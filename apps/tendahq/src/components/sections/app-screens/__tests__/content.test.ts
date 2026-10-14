/**
 * §00's escrow screen shows the contract's stages with WHEN each opens. The
 * review stage used to carry a typed hour count; the window is a contract
 * value that differs per network (#148), and this page is served to every
 * deployment, so the stage is phrased and never counted.
 */
import { describe, expect, it } from 'vitest'
import { EXAMPLE_ESCROW } from '@/content'
import { ESCROW_SCREEN } from '../content'

describe('escrow screen stages', () => {
  it('draws one standing per stage of the shared example, in order', () => {
    expect(ESCROW_SCREEN.stages.map((s) => s.label)).toEqual([...EXAMPLE_ESCROW.stages])
    expect(ESCROW_SCREEN.stages.map((s) => s.state)).toEqual(['done', 'now', 'todo', 'todo'])
  })

  it('phrases the review window and never counts it (#148)', () => {
    const review = ESCROW_SCREEN.stages[2]
    expect(review.when).toBe('review window')
    // No stage names a number of hours: the clock on the done stage is a time
    // of day, and the rest are words.
    for (const stage of ESCROW_SCREEN.stages) expect(stage.when).not.toMatch(/\d+\s*h/)
  })
})
