import { formatAssetAmount, type AdminEscrowDossier } from '@tenda/shared'
import { EscrowStatusBadge } from '@/components/common/status-badge'
import { PartyCard } from './party-card'
import { DetailsBlock } from './details-block'
import { ProofsGallery } from './proofs-gallery'
import { StatusTimeline } from './status-timeline'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {children}
    </div>
  )
}

/**
 * Mediation context panel — the full dossier behind a dispute (parties,
 * amount, kind-specific details, proofs, on-chain timeline) so a mediator
 * can judge with evidence rather than the chat thread alone.
 */
export function DossierPanel({ dossier }: { dossier: AdminEscrowDossier }) {
  const bond = Number(dossier.dispute_bond_raw) > 0
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
        <span className="text-lg font-semibold">
          {formatAssetAmount(dossier.amount_raw, dossier.asset)}
        </span>
        <EscrowStatusBadge status={dossier.status} />
        <span className="text-xs text-muted-foreground">{dossier.chain_id}</span>
        {bond && (
          <span className="ml-auto text-xs text-muted-foreground">
            Bond {formatAssetAmount(dossier.dispute_bond_raw, dossier.asset)}
          </span>
        )}
      </div>

      <Section title="Parties">
        <div className="space-y-2">
          {dossier.parties.map((p) => (
            <PartyCard key={p.user_id} party={p} kind={dossier.kind} />
          ))}
        </div>
      </Section>

      <Section title="Details">
        <DetailsBlock dossier={dossier} />
      </Section>

      <Section title="Proofs">
        <ProofsGallery
          proofs={dossier.proofs}
          paymentProofUrl={dossier.exchange?.payment_proof_url ?? null}
        />
      </Section>

      <Section title="Transaction history">
        <StatusTimeline transactions={dossier.transactions} asset={dossier.asset} />
      </Section>
    </div>
  )
}
