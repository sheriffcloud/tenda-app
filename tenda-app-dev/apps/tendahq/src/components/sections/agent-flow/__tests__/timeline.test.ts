import { describe, expect, it } from 'vitest'
import { FLOW_LANES, laneAt } from '@/content/agent-flow'
import { advance, clockForStep, laneDuration, laneIndexOf, stepAt } from '../useFlowTimeline'

/**
 * The sequencing, tested where it is decidable. This project installs no React
 * test renderer (hooks/__tests__/usePlatformConfig.test.ts tests `toPercent`
 * rather than the hook around it), so every decision the timeline makes lives
 * in a pure function and is checked here.
 */
const [HUMAN, AGENT] = FLOW_LANES

describe('stepAt', () => {
  it('reports the first step at the start of a lane', () => {
    expect(stepAt(HUMAN, 0)).toEqual({ index: 0, progress: 0 })
  })

  it('walks every step in order across a whole lane', () => {
    const seen = new Set<number>()
    const duration = laneDuration(HUMAN)
    for (let ms = 0; ms < duration; ms += 25) seen.add(stepAt(HUMAN, ms).index)
    expect(seen.size).toBe(HUMAN.steps.length)
  })

  it('holds the last frame past the end rather than wrapping itself', () => {
    // Wrapping is `advance`'s job, because that is where the LANE changes.
    // If this wrapped too, a lane would restart without ever handing over.
    const past = stepAt(HUMAN, laneDuration(HUMAN) + 5000)
    expect(past).toEqual({ index: HUMAN.steps.length - 1, progress: 1 })
  })

  it('never reports progress outside 0..1', () => {
    const duration = laneDuration(AGENT)
    for (let ms = 0; ms <= duration; ms += 37) {
      const { progress } = stepAt(AGENT, ms)
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThanOrEqual(1)
    }
  })
})

describe('laneIndexOf', () => {
  it('finds each lane’s cursor, so a pin wraps on that lane’s own duration', () => {
    // The two lanes are not the same length. Pinning the agent lane while the
    // cursor still sat on the human lane wrapped on the human duration and cut
    // the agent lane's last step short by the difference.
    expect(laneDuration(HUMAN)).not.toBe(laneDuration(AGENT))
    for (const [i, lane] of FLOW_LANES.entries()) {
      expect(laneIndexOf(lane.id)).toBe(i)
      expect(laneAt(laneIndexOf(lane.id)).id).toBe(lane.id)
    }
  })

  it('answers -1 for an id no lane carries, rather than a lane', () => {
    expect(laneIndexOf('not-a-lane')).toBe(-1)
    expect(laneIndexOf('')).toBe(-1)
  })
})

describe('clockForStep', () => {
  it('lands inside the requested step, near its end', () => {
    for (const [i, step] of HUMAN.steps.entries()) {
      const at = stepAt(HUMAN, clockForStep(HUMAN, i))
      expect(at.index).toBe(i)
      expect(at.progress).toBeGreaterThan(0.9)
      expect(at.progress).toBeLessThan(1)
      expect(step.ms).toBeGreaterThan(0)
    }
  })

  it('clamps an index past either end to the lane', () => {
    expect(stepAt(HUMAN, clockForStep(HUMAN, 99)).index).toBe(HUMAN.steps.length - 1)
    expect(stepAt(HUMAN, clockForStep(HUMAN, -5)).index).toBe(0)
  })
})

describe('advance', () => {
  it('moves the clock without changing lane mid-run', () => {
    expect(advance({ clock: 0, cursor: 0, deltaMs: 16, pinned: false })).toEqual({ clock: 16, cursor: 0 })
  })

  it('hands over to the NEXT lane when one finishes', () => {
    // The behaviour the whole section rests on: a visitor who does not click
    // still sees both lanes.
    const end = laneDuration(laneAt(0))
    const next = advance({ clock: end - 1, cursor: 0, deltaMs: 16, pinned: false })
    expect(next.cursor).toBe(1)
    expect(laneAt(next.cursor).id).not.toBe(laneAt(0).id)
  })

  it('carries the overshoot, so a slow frame cannot swallow the next lane’s first step', () => {
    const end = laneDuration(laneAt(0))
    const { clock } = advance({ clock: end - 4, cursor: 0, deltaMs: 20, pinned: false })
    expect(clock).toBe(16)
  })

  it('repeats the same lane while pinned, instead of handing over', () => {
    const end = laneDuration(laneAt(0))
    const next = advance({ clock: end - 1, cursor: 0, deltaMs: 16, pinned: true })
    expect(next.cursor).toBe(0)
    expect(next.clock).toBeLessThan(end)
  })

  it('cycles back round rather than running off the end of the lane list', () => {
    const last = FLOW_LANES.length - 1
    const end = laneDuration(laneAt(last))
    const next = advance({ clock: end, cursor: last, deltaMs: 16, pinned: false })
    expect(laneAt(next.cursor).id).toBe(FLOW_LANES[0].id)
  })

  it('does not produce a NaN clock when a delta exceeds a whole lane', () => {
    // A backgrounded tab resuming, or a debugger pause. The modulo is what
    // stops that becoming a blank circuit.
    const { clock } = advance({ clock: 0, cursor: 0, deltaMs: laneDuration(laneAt(0)) * 3 + 7, pinned: false })
    expect(Number.isFinite(clock)).toBe(true)
    expect(clock).toBeGreaterThanOrEqual(0)
  })
})
