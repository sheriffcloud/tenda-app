/**
 * §01 The hire loop — one circuit, two ways in.
 *
 * WHAT THIS FILE OWNS: the heading, the lane controls, the readable step list,
 * and the decision to run at all. WHAT IT DOES NOT OWN: the diagram.
 * `CustodyScene` is imported once, below, and swapping treatments is that one
 * line — copy, sequencing, viewport gating and reduced motion are unaffected.
 *
 * ACCESSIBILITY. The steps are published as a real ordered list carrying each
 * one's actor, detail and gas payer, and that list — not the drawing — is the
 * content. Nothing is revealed only by the animation: every step is in the
 * document at every moment, and the active one is emphasised rather than
 * uncovered. The section is therefore complete with motion off, with CSS off,
 * and to a screen reader.
 *
 * The lane cycles on its own instead of hiding half the section behind a tab a
 * visitor will not press. The segmented control pins a lane for anyone who
 * wants to read one properly, the play/pause holds the frame, and a click on
 * any caption seeks to that step.
 */
import { Pause, Play } from 'lucide-react'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { useIntersect } from '@/hooks/useIntersect'
import { FLOW_LANES } from '@/content/agent-flow'
import { cn } from '@/lib/cn'
import {
  AGENT_FLOW_HEADER,
  AGENT_FLOW_STEPS_LABEL,
  LANE_GROUP_LABEL,
  LANE_PIN_HINT,
  NO_GAS_LABEL,
  PLAY_LABELS,
} from './content'
import { useFlowTimeline } from './useFlowTimeline'
// THE SWAP POINT — one import, one line. See the file header.
import { CustodyScene } from './CustodyScene'

export function AgentFlow({ surface }: LandingSectionProps) {
  // The loop only runs on screen: a landing has no business burning frames on
  // a section nobody is looking at.
  const { ref, isVisible } = useIntersect<HTMLDivElement>({ threshold: 0.2 })
  const { lane, activeIndex, progress, pinnedId, togglePin, playing, setPlaying, seek } =
    useFlowTimeline({ running: isVisible })
  const [line1, line2] = AGENT_FLOW_HEADER.h2

  return (
    <SectionShell id="hire-loop" surface={surface}>
      <SectionRule title={AGENT_FLOW_HEADER.eyebrow} aside={AGENT_FLOW_HEADER.aside} />
      <SectionHead lede={AGENT_FLOW_HEADER.sub}>
        {line1}<Period />
        <br />
        {line2}<Period />
      </SectionHead>

      <div ref={ref} className="mt-[clamp(30px,4vw,52px)]">
        {/* The lane bar: a segmented control and the play/pause. */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={LANE_GROUP_LABEL}
            className="inline-flex flex-wrap rounded-[var(--radius-button)] bg-[var(--surface-inset)] p-[3px]"
          >
            {FLOW_LANES.map((l) => {
              const showing = l.id === lane.id
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => togglePin(l.id)}
                  aria-pressed={pinnedId === l.id}
                  className={cn(
                    'whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[13px] font-semibold leading-none transition-colors',
                    showing
                      ? 'bg-[var(--surface-card)] text-[var(--content-primary)] shadow-[var(--shadow-card)]'
                      : 'text-[var(--content-tertiary)] hover:text-[var(--content-primary)]',
                  )}
                >
                  {l.title}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? PLAY_LABELS.pause : PLAY_LABELS.play}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border border-[var(--border-default)] text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-pressed)] hover:text-[var(--content-primary)]"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </div>
        {/* The lane's one-line note, on its own line: the two notes differ in
            length, so beside the controls it wrapped on one lane and not the
            other, and the bar jumped every time the lane switched. */}
        <p className="eyebrow mt-3 text-[var(--content-tertiary)]">
          {lane.note} · {pinnedId === null ? LANE_PIN_HINT.cycling : LANE_PIN_HINT.pinned}
        </p>

        {/* Below phone width the scene keeps its size and scrolls sideways —
            see `.custody-scroll` — rather than shrinking its labels to 3px. */}
        <div className="custody-scroll mt-[clamp(24px,3vw,36px)]">
          <CustodyScene lane={lane} activeIndex={activeIndex} progress={progress} />
        </div>

        <h3 className="sr-only">{AGENT_FLOW_STEPS_LABEL}</h3>
        {/*
          SIX columns, one per step, aligned under the six nodes on the axis
          above — three columns broke that correspondence, so a reader could
          not tell which caption belonged to the lit node. Each caption is a
          button: it seeks the loop to its step.
        */}
        <ol className="mt-[clamp(18px,2.4vw,28px)] grid border-t border-[var(--border-default)] sm:grid-cols-2 lg:grid-cols-6">
          {lane.steps.map((step, i) => (
            <li
              key={step.id}
              className={cn(
                'flex border-[var(--border-subtle)] transition-opacity duration-[450ms]',
                'border-b lg:border-b-0 lg:border-r lg:last:border-r-0',
                // Presentational only — every step stays in the document and
                // stays readable, at every point in the loop.
                i === activeIndex ? 'opacity-100' : 'opacity-40',
              )}
            >
              <button
                type="button"
                onClick={() => seek(i)}
                className="flex w-full flex-col gap-2 py-4 pr-4 text-left"
              >
                <span className="eyebrow text-[var(--content-tertiary)]">
                  {String(i + 1).padStart(2, '0')} · {step.actor}
                </span>
                <span className="title text-[15px] leading-5 text-[var(--content-primary)]">{step.label}</span>
                <span className="text-[12px] leading-[18px] text-[var(--content-tertiary)]">{step.note}</span>
                <span
                  className={cn(
                    'eyebrow mt-auto inline-flex self-start rounded-full border px-2.5 py-1',
                    step.gas === null
                      ? 'border-dashed border-[var(--border-default)] text-[var(--content-tertiary)]'
                      : 'border-[var(--border-strong)] text-[var(--content-secondary)]',
                  )}
                >
                  {step.gas ?? NO_GAS_LABEL}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  )
}
