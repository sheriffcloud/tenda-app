/**
 * The hero's right column: one example escrow, mid-flight, as a RECEIPT.
 *
 * This is the Receipt direction's thesis object. An escrow is a contract
 * that leaves a paper trail — an amount, who is not touching it, and the
 * split the contract will make when proof clears — and the page opens on
 * that trail rather than on a lit panel or a deck of gig cards. It is a
 * white card on the paper ground at mobile's card radius with the elevated
 * shadow; the numbers are mono and tabular; the payout line is the one
 * place the money green appears above the fold.
 *
 * The four contract states run along the foot with a pip that walks them
 * (styles/components.css `.stage-line`). Decorative: the same sequence is published as
 * a real list in the hire loop below, so nothing here is the only copy of
 * anything. Copy and every figure come from `content.ts`.
 */
import { LiveDot } from '@/components/ui/LiveDot'
import { cn } from '@/lib/cn'
import { ESCROW_PANEL, HERO_CONTENT } from './content'

/**
 * Where the stops sit along the track: spread evenly between the pip's own
 * first and last positions — the `stage-pip` keyframe in
 * styles/components.css runs 8% → 92%, and both stop and pip are centred on
 * their `left` — so the pip lands on each stop whatever their count. The
 * rendered test reads the keyframe and checks these two agree with it.
 */
const STOP_FIRST = 8
const STOP_LAST = 92
function stopLeft(index: number, count: number): string {
  if (count < 2) return `${STOP_FIRST}%`
  return `${STOP_FIRST + (index * (STOP_LAST - STOP_FIRST)) / (count - 1)}%`
}

export function EscrowReceipt() {
  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="img"
        aria-label={`Example escrow: ${ESCROW_PANEL.rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}
        className="w-full rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card-elevated)] px-[26px] pb-[22px] pt-6 shadow-[var(--shadow-elevated)] lg:max-w-[460px] lg:justify-self-end"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border-default)] pb-[18px]">
          <span className="eyebrow text-[var(--content-secondary)]">{ESCROW_PANEL.eyebrow}</span>
          <span className="eyebrow ml-auto inline-flex h-[26px] items-center gap-[7px] rounded-full border border-[var(--border-default)] px-[11px] text-[var(--content-tertiary)]">
            <LiveDot size={6} pulseMs={2800} />
            {ESCROW_PANEL.state}
          </span>
        </header>

        <p className="mt-[22px] flex items-baseline gap-2.5">
          <span className="font-[var(--font-mono)] text-[clamp(44px,5vw,60px)] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--content-primary)]">
            {ESCROW_PANEL.amount}
          </span>
          <span className="font-[var(--font-mono)] text-[13px] font-medium tracking-[0.5px] text-[var(--content-tertiary)]">
            {ESCROW_PANEL.unit}
          </span>
        </p>

        <p className="body-sm mt-3 max-w-[40ch] text-[var(--content-tertiary)]">
          {ESCROW_PANEL.custody}
        </p>

        <dl className="mt-5 border-t border-[var(--border-default)] pt-1.5">
          {ESCROW_PANEL.rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline gap-4 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
            >
              <dt className="body-sm text-[var(--content-tertiary)]">{row.label}</dt>
              <dd
                className={cn(
                  'ml-auto font-[var(--font-mono)] text-[13px] leading-[18px] tabular-nums',
                  'money' in row && row.money
                    ? 'font-semibold text-[var(--utility-money)]'
                    : 'font-medium text-[var(--content-primary)]',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div aria-hidden className="stage-line">
          <span className="track" />
          {ESCROW_PANEL.stages.map((stage, i) => (
            <span key={stage} className="stop" style={{ left: stopLeft(i, ESCROW_PANEL.stages.length) }}>
              {stage}
            </span>
          ))}
          <span className="pip" />
        </div>
      </div>

      <p className="eyebrow text-center text-[var(--content-tertiary)]">
        {HERO_CONTENT.deckCaption}
      </p>
    </div>
  )
}
