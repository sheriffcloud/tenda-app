/**
 * What the worker will have to hand over (comp lines 623-637).
 *
 * On the PUBLIC page on purpose: the requirement is carried on the summary
 * too, because discovering it after accepting is a bait-and-switch (shared
 * GigSummary doc). An empty requirement list is legal and means "any
 * evidence" — the state every gig had before the field existed — so it says
 * that rather than rendering an empty section.
 */
import { PROOF_TYPE_LABEL, proofParamDetail, type ProofParams, type ProofType } from '@tenda/shared'
import { AlignLeft, Braces, FileText, Image, MapPin, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GIG_DETAIL_COPY } from './copy'

const PROOF_ICONS: Record<ProofType, LucideIcon> = {
  image: Image,
  video: Video,
  document: FileText,
  geotag: MapPin,
  text: AlignLeft,
  structured: Braces,
}

export function GigProofList({
  requirements,
  params = null,
}: {
  requirements: readonly ProofType[]
  /** The gig's per-type params — the bar each requirement sets (radius, fields). */
  params?: ProofParams | null
}) {
  return (
    <ul className="flex max-w-[60ch] list-none flex-col gap-2.5 p-0">
      {requirements.length === 0 ? (
        // Still a list item: "any evidence" is the requirement, not the
        // absence of the section, and an <li> outside a <ul> is invalid.
        <ProofItem
          Icon={FileText}
          title={GIG_DETAIL_COPY.proofAnyTitle}
          hint={GIG_DETAIL_COPY.proofAnyHint}
        />
      ) : (
        requirements.map((type) => (
          <ProofItem
            key={type}
            Icon={PROOF_ICONS[type]}
            title={PROOF_TYPE_LABEL[type]}
            hint={GIG_DETAIL_COPY.proofHint[type]}
            detail={proofParamDetail(type, params)}
          />
        ))
      )}
    </ul>
  )
}

function ProofItem({
  Icon,
  title,
  hint,
  detail = null,
}: {
  Icon: LucideIcon
  title: string
  hint: string
  /** The declared bar (check-in radius, fields to report), when one exists. */
  detail?: string | null
}) {
  return (
    // A tile for the glyph and plain text beside it (#60) — one row per
    // requirement, not a card per requirement.
    <li className="grid list-none grid-cols-[30px_minmax(0,1fr)] items-start gap-3">
      <span className="grid size-[30px] place-items-center rounded-xs bg-surface-inset">
        <Icon size={15} aria-hidden className="text-content-secondary" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-[22px] text-content-primary">{title}</p>
        <p className="type-body-small text-content-tertiary">{hint}</p>
        {detail !== null && (
          <p className="mt-1 break-words type-body-small font-medium text-content-primary">
            {detail}
          </p>
        )}
      </div>
    </li>
  )
}
