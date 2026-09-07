import { proofPayloadLines } from '@tenda/shared'
import type { DossierProof, ProofPayload, ProofType } from '@tenda/shared'

/** Icon glyph per non-image proof kind — images render as thumbnails. */
const KIND_GLYPH: Record<Exclude<ProofType, 'image'>, string> = {
  video: '🎬',
  document: '📄',
  geotag: '📍',
  text: '📝',
  structured: '🧾',
}

export function ProofTile({
  url,
  type,
  label,
}: {
  url: string | null
  type: ProofType
  label: string
}) {
  const body =
    type === 'image' && url !== null ? (
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, no next/image domain config in admin
      <img src={url} alt={label} className="h-full w-full object-cover" />
    ) : (
      <>
        <span className="text-2xl">{type === 'image' ? '🖼' : KIND_GLYPH[type]}</span>
        <span className="mt-1 truncate px-1 text-[10px] text-muted-foreground">{label}</span>
      </>
    )
  const frame =
    'group flex h-24 w-24 flex-col items-center justify-center overflow-hidden rounded-md border text-center'
  if (url === null) {
    return (
      <div className={frame} title={label}>
        {body}
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={frame} title={label}>
      {body}
    </a>
  )
}

/**
 * A data proof's payload, readable in place — a mediator weighing a dispute
 * needs the reported values themselves, not a tooltip. Lines come from the
 * shared formatter, so the payload reads exactly as the parties saw it.
 */
export function DataProofCard({ label, payload }: { label: string; payload: ProofPayload }) {
  return (
    <div className="flex min-w-40 max-w-64 flex-col gap-1 rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {proofPayloadLines(payload).map((line, index) => (
        <p key={index} className="break-words text-xs">
          {line.label !== null && <span className="text-muted-foreground">{line.label}: </span>}
          {line.value}
        </p>
      ))}
    </div>
  )
}

/**
 * Submitted evidence. Handles every proof kind — image thumbnails,
 * video/document links, data-proof payload cards rendered in full — and
 * folds in the exchange fiat payment proof, which lives on exchange_details
 * rather than escrow_proofs.
 */
export function ProofsGallery({
  proofs,
  paymentProofUrl,
}: {
  proofs: DossierProof[]
  paymentProofUrl?: string | null
}) {
  const payment =
    paymentProofUrl !== undefined && paymentProofUrl !== null && paymentProofUrl !== ''
      ? paymentProofUrl
      : null
  if (proofs.length === 0 && payment === null) {
    return <p className="text-sm text-muted-foreground">No proofs submitted.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {payment !== null && <ProofTile url={payment} type="image" label="Payment proof" />}
      {proofs.map((p, i) =>
        p.payload !== null && p.payload !== undefined ? (
          <DataProofCard key={p.id} label={`${p.type} ${i + 1}`} payload={p.payload} />
        ) : (
          <ProofTile key={p.id} url={p.url} type={p.type} label={`${p.type} ${i + 1}`} />
        ),
      )}
    </div>
  )
}
