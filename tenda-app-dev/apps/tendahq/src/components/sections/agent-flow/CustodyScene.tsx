/**
 * THE SWAPPABLE VISUAL — custody, drawn as one fixed-viewBox SVG.
 *
 * REPLACING THIS IS ONE IMPORT in AgentFlow.tsx. Nothing else names this file:
 * the section owns the heading, the readable step list and the lane controls,
 * and hands this component the three things any diagram of the same data
 * needs. It is `aria-hidden` and renders no text a reader depends on — the
 * steps are published beneath it as a real ordered list.
 *
 * WHAT IT SHOWS, and why this shape. The money rides the upper track, drops
 * into the escrow vault at the centre when the gig is funded, and then sits
 * still while the event axis underneath carries on through accept and proof.
 * At settlement it leaves for the worker. That stillness in the middle is the
 * section's argument made literal: the work keeps moving, the money does not
 * move with it, and neither party can reach it in between.
 *
 * SVG, NOT CANVAS, and the palette is plain `var()`.
 * The canvas version had to read every colour off the live element and re-read
 * it on resize and on theme change, because a canvas cannot resolve `var()`.
 * SVG can, so the whole palette-plumbing problem disappears: these shapes are
 * styled from styles/components.css like anything else and follow the theme for free.
 *
 * A fixed viewBox is also the reason this cannot flicker. Everything that
 * moves moves in user-space coordinates — x2, cx, transform — which the HTML
 * layout engine never measures. Animating `left`/`width`/changing text in a
 * DOM version repeatedly triggered a resize→re-wrap→resize loop.
 *
 * NOTHING IS GATED ON `prefers-reduced-motion` HERE. `useFlowTimeline` already
 * decides that, and it holds the FINISHED frame rather than freezing at step
 * zero — so under reduced motion this renders the settled state, money paid,
 * which is the honest end of the story rather than a dead first frame.
 */
import { FEE_EXAMPLE } from '@/content'
import { money2 } from '@/lib/money'
import type { FlowLane } from '@/content/agent-flow'
import { CUSTODY_LABELS } from './content'

export interface FlowVisualProps {
  lane: FlowLane
  activeIndex: number
  /** 0..1 through the active step. */
  progress: number
}

/* One coordinate system, fixed for the life of the component. */
const VIEW = { w: 1000, h: 232 }
const TRACK_Y = 46
const VAULT_Y = 126
const AXIS_Y = 196
const VAULT_X = 500
const X: readonly number[] = [70, 242, 414, 586, 758, 930]
const FIRST = X[0]
const LAST = X[X.length - 1]
/** The settle step — the last one, on both lanes. */
const PAY_AT = 5

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
}
function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u
}

/**
 * Which step the money stops being the hiring party's.
 *
 * Read off the lane rather than declared here: a person's own wallet funds the
 * escrow at step 02, while an agent signs at 02 and the funds only move at 03,
 * when Tenda relays that signature. The two lanes are genuinely different
 * shapes and the diagram has no business asserting either.
 */
function lockIndexOf(lane: FlowLane): number {
  const i = lane.steps.findIndex((step) => step.tone === 'value')
  // Every lane has a value step by construction; -1 would put the money in the
  // vault from the first frame, which is the one reading that is never true.
  return i === -1 ? 1 : i
}

export function CustodyScene({ lane, activeIndex, progress }: FlowVisualProps) {
  const lockAt = lockIndexOf(lane)
  const e = ease(progress)
  const headX = lerp(FIRST, LAST, (activeIndex + e) / (X.length - 1))

  const holding =
    (activeIndex > lockAt && activeIndex < PAY_AT) ||
    (activeIndex === lockAt && progress > 0.7)
  const paid = activeIndex >= PAY_AT && progress > 0.3

  const lockX = lerp(FIRST, LAST, lockAt / (X.length - 1))
  let moneyX = headX
  let moneyY: number = TRACK_Y
  if (activeIndex === lockAt) {
    moneyX = lerp(lockX, VAULT_X, e)
    moneyY = lerp(TRACK_Y, VAULT_Y, e)
  } else if (activeIndex > lockAt && activeIndex < PAY_AT) {
    moneyX = VAULT_X
    moneyY = VAULT_Y
  } else if (activeIndex >= PAY_AT) {
    moneyX = lerp(VAULT_X, LAST, e)
    moneyY = lerp(VAULT_Y, TRACK_Y, e)
  }

  const vaultState = holding ? 'holding' : paid ? 'released' : 'idle'
  const amount = money2(paid ? FEE_EXAMPLE.payoutAmount : FEE_EXAMPLE.lockedAmount)

  return (
    <svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="custody block h-auto w-full"
      data-lane={lane.id}
      data-state={vaultState}
      aria-hidden="true"
      focusable="false"
    >
      {/* upper track — where the money rides while it is still someone's */}
      <line className="cs-dash" x1={40} y1={TRACK_Y} x2={960} y2={TRACK_Y} />

      <text className="cs-lbl" x={40} y={TRACK_Y - 20}>
        {`${lane.left.label} → ${lane.right.label}`.toUpperCase()}
      </text>

      {/* the vault, dead centre: the money's one resting place */}
      <rect
        className="cs-vault"
        x={VAULT_X - 108}
        y={VAULT_Y - 29}
        width={216}
        height={58}
        rx={18}
      />
      <text className="cs-vlbl" x={VAULT_X} y={VAULT_Y - 42} textAnchor="middle">
        {CUSTODY_LABELS[vaultState]}
      </text>

      {/* lower axis — the events, which carry on without the money */}
      <line className="cs-axis" x1={FIRST} y1={AXIS_Y} x2={LAST} y2={AXIS_Y} />
      <line className="cs-run" x1={FIRST} y1={AXIS_Y} x2={headX} y2={AXIS_Y} />

      {X.map((x, k) => (
        <g key={x}>
          <circle
            className={k <= activeIndex ? 'cs-nd is-on' : 'cs-nd'}
            cx={x}
            cy={AXIS_Y}
            r={k === activeIndex ? 8 : k < activeIndex ? 6 : 5}
          />
          <text className="cs-num" x={x} y={AXIS_Y + 24} textAnchor="middle">
            {String(k + 1).padStart(2, '0')}
          </text>
        </g>
      ))}

      <circle className="cs-halo" cx={headX} cy={AXIS_Y} r={11 + 6 * (1 - e)} />
      <circle className="cs-head" cx={headX} cy={AXIS_Y} r={5.5} />

      {/* the money itself */}
      <g
        className={`cs-tok is-${vaultState}`}
        transform={`translate(${moneyX},${moneyY})`}
      >
        <rect x={-68} y={-18} width={136} height={36} rx={18} />
        <text x={0} y={5} textAnchor="middle">{`${amount} ${CUSTODY_LABELS.asset}`}</text>
      </g>
    </svg>
  )
}
