/**
 * Sequencing for the hire-loop section: which step is lit, and which lane.
 *
 * KEPT OUT OF THE VISUAL. The diagram is expected to be replaced; timing,
 * viewport gating, lane auto-advance and reduced motion are the parts that must
 * behave identically whichever diagram is on screen. A replacement takes
 * `{ lane, activeIndex }` and renders.
 *
 * AUTO-ADVANCE, NOT A BARE TOGGLE. A landing visitor does not click, so a
 * control is the wrong way to reveal half the content: the lane flips itself
 * when the loop wraps, and a visitor who wants to stay on one pins it. Two
 * more controls came with the Paper Landing: a play/pause, and a click on any
 * step caption to seek the loop to that step (which also pauses it, since a
 * click means "let me read this one").
 */
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { FLOW_LANES, laneAt, type FlowLane } from '@/content/agent-flow'

/** Total run time of a lane. */
export function laneDuration(lane: FlowLane): number {
  return lane.steps.reduce((sum, step) => sum + step.ms, 0)
}

/**
 * Which step a lane is on at `ms`, and how far through it.
 *
 * Pure, and exported because this project installs no React test renderer —
 * see hooks/__tests__/usePlatformConfig.test.ts, which tests `toPercent` rather
 * than the hook wrapping it. A decision left inside a hook body is a decision
 * nothing can check.
 */
export function stepAt(lane: FlowLane, ms: number): { index: number; progress: number } {
  let acc = 0
  for (let i = 0; i < lane.steps.length; i += 1) {
    const step = lane.steps[i]
    if (ms < acc + step.ms) return { index: i, progress: (ms - acc) / step.ms }
    acc += step.ms
  }
  // Past the end: hold the last frame rather than wrapping here. Wrapping is
  // the caller's job, because that is where the lane changes.
  return { index: lane.steps.length - 1, progress: 1 }
}

/**
 * The clock at which step `index` is nearly finished — where a seek lands so
 * the step shows its settled state rather than its first frame. Clamped to
 * the lane, so an index past the end seeks to the last step.
 */
export function clockForStep(lane: FlowLane, index: number): number {
  const i = Math.max(0, Math.min(index, lane.steps.length - 1))
  let acc = 0
  for (let k = 0; k < i; k += 1) acc += lane.steps[k].ms
  return acc + lane.steps[i].ms * 0.985
}

/**
 * The cursor for a lane id, or -1 when no lane carries it. Pinning moves the
 * cursor here so `advance` wraps on the PINNED lane's duration: the two lanes
 * are not the same length, and wrapping on the other lane's clock cut the
 * pinned lane's last step short by the difference.
 */
export function laneIndexOf(id: string): number {
  return FLOW_LANES.findIndex((lane) => lane.id === id)
}

/**
 * Advance the clock, wrapping into the NEXT lane when a lane finishes.
 *
 * Returns the new clock and lane cursor. Pinning stops the cursor moving, so a
 * pinned lane repeats instead of handing over; that is the whole difference
 * between "let it play" and "I want to read this one".
 */
export function advance(args: {
  clock: number
  cursor: number
  deltaMs: number
  pinned: boolean
}): { clock: number; cursor: number } {
  const { clock, cursor, deltaMs, pinned } = args
  const duration = laneDuration(laneAt(cursor))
  const next = clock + deltaMs
  if (next < duration) return { clock: next, cursor }
  // Carry the overshoot so a slow frame does not swallow the first step of the
  // next lane; modulo guards a delta longer than a whole lane.
  return { clock: next % duration, cursor: pinned ? cursor : cursor + 1 }
}

export interface FlowTimeline {
  lane: FlowLane
  activeIndex: number
  progress: number
  /** The lane the visitor pinned, or null while it is cycling. */
  pinnedId: string | null
  /** Pin a lane, or unpin it by choosing the one already pinned. */
  togglePin(id: string): void
  /** Whether the clock is running. */
  playing: boolean
  setPlaying(next: boolean): void
  /** Jump to a step of the current lane and hold there. */
  seek(index: number): void
}

export function useFlowTimeline(args: { running: boolean }): FlowTimeline {
  const reduced = useReducedMotion()
  // ONE state object, not two. Clock and lane cursor change together, and
  // splitting them meant calling setCursor from inside the setClock updater —
  // a side effect in a reducer, which StrictMode double-invokes, advancing the
  // lane twice per wrap.
  const [{ clock, cursor }, setPosition] = useState({ clock: 0, cursor: 0 })
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  const raf = useRef(0)
  const last = useRef(0)

  // `pinnedId` and `playing` are DEPENDENCIES, not refs read during render.
  // Mirroring them into refs is the usual trick for keeping a rAF closure
  // fresh, but writing a ref while rendering is exactly what react-hooks/refs
  // forbids — and there is no need here: both change on a click, so
  // restarting the loop on that click costs one frame and keeps the closure
  // honest.
  useEffect(() => {
    if (reduced || !args.running || !playing) return
    const pinned = pinnedId !== null
    last.current = performance.now()
    const tick = (now: number) => {
      const deltaMs = Math.min(64, now - last.current)
      last.current = now
      setPosition((pos) => advance({ ...pos, deltaMs, pinned }))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [reduced, args.running, pinnedId, playing])

  const togglePin = (id: string): void => {
    const cursorFor = laneIndexOf(id)
    setPinnedId((current) => (current === id ? null : id))
    if (cursorFor !== -1) setPosition((pos) => ({ ...pos, cursor: cursorFor }))
  }

  const pinnedLane = pinnedId === null ? null : FLOW_LANES.find((l) => l.id === pinnedId) ?? null
  const lane = pinnedLane ?? laneAt(cursor)

  const seek = (index: number): void => {
    setPlaying(false)
    setPosition((pos) => ({ ...pos, clock: clockForStep(lane, index) }))
  }

  // Reduced motion holds the FINISHED frame: freezing at step 0 would hide five
  // of six steps from exactly the people least able to wait for a reveal.
  if (reduced) {
    return {
      lane,
      activeIndex: lane.steps.length - 1,
      progress: 1,
      pinnedId,
      togglePin,
      playing: false,
      setPlaying,
      seek,
    }
  }

  const { index, progress } = stepAt(lane, clock)
  return { lane, activeIndex: index, progress, pinnedId, togglePin, playing, setPlaying, seek }
}
