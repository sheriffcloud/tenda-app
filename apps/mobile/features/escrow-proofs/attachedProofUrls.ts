import { canonicalJson } from '@tenda/shared'
import { api } from '@/api/client'

/**
 * Every proof URL currently stored against the escrow, in a canonical order.
 *
 * This is what the on-chain submit commits to. Not the batch the worker just
 * picked — that is what it used to be, and it made the digest mean "the last
 * upload" rather than "the evidence". Two consequences of the old basis, both
 * real: a worker who added a photo, then a receipt, then submitted sealed only
 * the receipt; and a worker whose upload succeeded but whose submit tx failed
 * had nothing to hash on retry unless they uploaded the same files again.
 *
 * Read back from the server rather than composed from the client's copy of the
 * detail, so the seal describes what is actually stored at the moment of
 * signing and not what this screen last happened to fetch.
 *
 * SORTED, because a set has no inherent order and the digest must not depend
 * on the order rows come back in — `GET /escrows/:id/proofs` declares none.
 * `proofHashFor` stays order-SENSITIVE (it is a hash over a list); this is the
 * one place that decides which list. apps/web's `attachedProofUrls` is the
 * twin and must stay identical: the two clients have to seal the same digest
 * over the same evidence.
 */
export async function attachedProofUrls(escrowId: string): Promise<string[]> {
  const stored = await api.escrows.proofs({ id: escrowId })
  // A data proof (geotag/text/structured) has no url — its substance is the
  // payload, sealed as canonical JSON so the digest still covers ALL the
  // evidence. File-only escrows produce the exact list they always did, so
  // every existing digest stays reproducible.
  return stored.map((proof) => proof.url ?? canonicalJson(proof.payload)).sort()
}
