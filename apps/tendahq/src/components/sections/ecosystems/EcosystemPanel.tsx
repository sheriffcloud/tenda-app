import { Check, ExternalLink, Loader } from 'lucide-react'
import { chainByFamily, type EcosystemPanel as EcosystemPanelData } from '@/content'
import { cn } from '@/lib/cn'

interface Props {
  panel: EcosystemPanelData
  className?: string
}

/**
 * One chain panel in §06 — identity (glyph, colour) from the manifest-derived
 * chain registry, proof points from content/ecosystems.ts. Shipped proofs get
 * a check; in-progress ones a spinner glyph and dimmed text, so the section
 * stays honest for grant reviewers reading closely.
 */
export function EcosystemPanel({ panel, className }: Props) {
  const chain = chainByFamily(panel.chainFamily)
  if (!chain) return null

  return (
    <article
      className={cn(
        'relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--surface-card-elevated)] p-7',
        'shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${chain.color} 65%, transparent), transparent)`,
        }}
      />

      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-inset)] text-xl text-[var(--content-primary)]"
        >
          {chain.glyph}
        </span>
        <div className="min-w-0">
          <h3 className="h3 inline-flex items-center gap-2 text-[var(--content-primary)]">
            {chain.name}
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chain.color }}
            />
          </h3>
          <p className="mono-sm text-[var(--content-tertiary)]">{chain.pitch}</p>
        </div>
      </header>

      <p className="body text-[var(--content-secondary)]">{panel.why}</p>

      <ul className="flex flex-col gap-2.5">
        {panel.proofs.map((proof) => (
          <li key={proof.label} className="flex items-start gap-2.5">
            {proof.inProgress ? (
              <Loader className="mt-0.5 h-4 w-4 shrink-0 text-[var(--content-tertiary)]" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
            )}
            <span
              className={cn(
                'body-sm',
                proof.inProgress
                  ? 'text-[var(--content-tertiary)]'
                  : 'text-[var(--content-primary)]',
              )}
            >
              {proof.label}
              {proof.inProgress && (
                <span className="mono-sm ml-1.5 text-[var(--content-tertiary)]">in progress</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {chain.explorerUrl && (
        <a
          href={chain.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mono-sm mt-auto inline-flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-4 text-[var(--content-tertiary)] transition-colors hover:text-[var(--content-primary)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {chain.explorerUrl.replace('https://', '')}
        </a>
      )}
    </article>
  )
}
