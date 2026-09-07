import {
  chainLabel,
  formatDeadline,
  truncateWallet,
  type GigDetail,
} from '@tenda/shared'
import type { DossierFact } from '@/components/escrow/dossier'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'

/**
 * The facts under the money block (Tier 2 comp, lines 520-540).
 *
 * Every one is read straight off the wire, and a fact with nothing behind it
 * is OMITTED rather than printed as an em dash — a labelled blank reads as a
 * value the reader failed to supply.
 */
export function dossierFactsFor(gig: GigDetail): readonly DossierFact[] {
  const facts: DossierFact[] = [{ label: 'Chain', value: chainLabel(gig.chain_id) }]
  // Which of the viewer's wallets THIS escrow is bound to (viewer-relative on
  // the wire) — the workspace is where a worker looks first, and an assigned
  // worker never chose the wallet, the poster's assign baked their primary.
  if (gig.my_signer_address !== null) {
    facts.push({
      label: GIG_DETAIL_COPY.yourWallet,
      value: truncateWallet(gig.my_signer_address),
    })
  }
  if (gig.accept_deadline !== null) {
    facts.push({ label: 'Accept by', value: formatDeadline(gig.accept_deadline) })
  }
  if (gig.completion_deadline !== null) {
    facts.push({ label: 'Deliver by', value: formatDeadline(gig.completion_deadline) })
  }
  if (gig.approval_deadline !== null) {
    facts.push({ label: 'Auto-releases', value: formatDeadline(gig.approval_deadline) })
  }
  return facts
}

// `dossierProofsFor` moved to `components/escrow/dossier/DossierProofList.tsx`
// in the #48 review: it is kind-agnostic (the exchange detail feeds it too),
// so it lives beside its renderer rather than under gig/my-gigs.
