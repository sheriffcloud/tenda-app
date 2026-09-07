import type { ReactNode } from 'react'
import { Pill } from '@/components/ui/Pill'
import { Sheet, SheetHead } from '@/components/ui/Sheet'
import {
  chainByFamily,
  chainStatus,
  CHAIN_STATUS_DISPLAY,
  explorerHost,
  NETWORK_LABELS,
  PROOF_LABELS,
  transportFor,
  type EcosystemPanel as EcosystemPanelData,
} from '@/content'
import { cn } from '@/lib/cn'
import { CopyChainId } from './CopyChainId'

interface Props {
  panel: EcosystemPanelData
  /** The panel's id and the tab that labels it — the tablist wiring. */
  id: string
  labelledBy: string
}

/** The glyph a proof point carries: shipped, or on the roadmap. */
const PROOF_MARK = { shipped: '✓', roadmap: '○' } as const

/**
 * One chain panel in §06 — the quiet card. A ruled head with the chain's
 * name and its honest status chip; the why-sentence set in the display face;
 * the proof points as ruled rows, a check for what shipped and a hollow mark
 * plus a Roadmap pill for what has not; and the reference strip — chain id,
 * gas token, wallet, explorer — every value read from the shared manifest.
 */
export function EcosystemPanel({ panel, id, labelledBy }: Props) {
  const chain = chainByFamily(panel.chainFamily)
  if (!chain) return null
  const transport = transportFor(chain.namespace)
  const status = CHAIN_STATUS_DISPLAY[chainStatus(chain)]
  const live = status.tone === 'live'

  return (
    <Sheet role="tabpanel" id={id} aria-labelledby={labelledBy} className="mt-[22px]">
      <SheetHead label={chain.name}>
        <Pill tone={status.tone} dot={live} pulse={live}>
          {status.label}
        </Pill>
      </SheetHead>

      <div className="p-[clamp(28px,3.4vw,40px)_clamp(26px,3.2vw,38px)]">
        <p className="max-w-[34ch] font-[var(--font-display)] text-[clamp(20px,2.3vw,26px)] font-semibold leading-[1.28] tracking-[-0.01em] text-[var(--content-primary)]">
          {panel.why}
        </p>

        <ul className="mt-7 border-t border-[var(--border-default)]">
          {panel.proofs.map((proof) => (
            <li
              key={proof.label}
              className={cn(
                'flex items-baseline gap-3.5 border-b border-[var(--border-subtle)] py-3.5 last:border-b-0',
                proof.roadmap ? 'text-[var(--content-tertiary)]' : 'text-[var(--content-secondary)]',
              )}
            >
              <span
                aria-hidden
                className={cn('w-3.5 shrink-0 font-[var(--font-mono)] text-[11px]', !proof.roadmap && 'text-[var(--content-primary)]')}
              >
                {proof.roadmap ? PROOF_MARK.roadmap : PROOF_MARK.shipped}
              </span>
              <span className="text-[14.5px] leading-[23px]">{proof.label}</span>
              {proof.roadmap && <Pill className="ml-auto shrink-0">{PROOF_LABELS.roadmap}</Pill>}
            </li>
          ))}
        </ul>

        {/*
          The reference strip: what you would actually be connecting to, on
          the panel for the chain it describes. Every value is read from the
          shared manifest, so a chain added there appears here with no edit.
        */}
        <dl className="mt-[26px] grid grid-cols-2 gap-[22px_18px] border-t border-[var(--border-default)] pt-5 md:grid-cols-4">
          <Fact label={NETWORK_LABELS.chainId}>
            {/* Only the id truncates; the button is its sibling and never clips. */}
            <code className="truncate">{chain.id}</code>
            <CopyChainId chainId={chain.id} />
          </Fact>
          <Fact label={NETWORK_LABELS.gasToken}>
            <span className="truncate">{chain.nativeSymbol}</span>
          </Fact>
          {transport !== '' && (
            <Fact label={NETWORK_LABELS.transport}>
              <span className="truncate">{transport}</span>
            </Fact>
          )}
          {chain.explorerUrl !== undefined && (
            <Fact label={NETWORK_LABELS.explorer}>
              <a
                href={chain.explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-[var(--brand-primary)] hover:underline"
              >
                {explorerHost(chain.explorerUrl)}
              </a>
            </Fact>
          )}
        </dl>
      </div>
    </Sheet>
  )
}

/** One label/value pair in the reference strip. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-[var(--content-tertiary)]">{label}</dt>
      <dd className="mt-[9px] flex min-w-0 items-center gap-[7px] font-[var(--font-mono)] text-[12.5px] text-[var(--content-primary)]">
        {children}
      </dd>
    </div>
  )
}
