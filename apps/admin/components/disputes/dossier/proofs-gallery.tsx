import type { DossierProof, ProofType } from '@tenda/shared'

/** Icon glyph per non-image proof kind — images render as thumbnails. */
const KIND_GLYPH: Record<Exclude<ProofType, 'image'>, string> = {
  video: '🎬',
  document: '📄',
}

export function ProofTile({ url, type, label }: { url: string; type: ProofType; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-24 w-24 flex-col items-center justify-center overflow-hidden rounded-md border text-center"
      title={label}
    >
      {type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, no next/image domain config in admin
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <>
          <span className="text-2xl">{KIND_GLYPH[type]}</span>
          <span className="mt-1 truncate px-1 text-[10px] text-muted-foreground">{label}</span>
        </>
      )}
    </a>
  )
}

/**
 * Submitted evidence. Handles all three proof kinds (image thumbnails,
 * video/document links) and folds in the exchange fiat payment proof, which
 * lives on exchange_details rather than escrow_proofs.
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
      {proofs.map((p, i) => (
        <ProofTile key={p.id} url={p.url} type={p.type} label={`${p.type} ${i + 1}`} />
      ))}
    </div>
  )
}
