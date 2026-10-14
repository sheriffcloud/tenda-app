import { isFileProofType } from '@tenda/shared'
import type { EscrowProof } from '@tenda/shared'
import type { MediaItem } from './types'

/**
 * The FILE proofs of an escrow as viewer media. Before the data proof types
 * (geotag/text/structured) existed, EscrowProof was structurally a MediaItem
 * and screens passed rows straight through; now the media surfaces get
 * exactly the rows that ARE media — a data proof has no url to open and its
 * rendering is its own surface (#15), not a broken tile here.
 */
export function fileProofMediaItems(proofs: readonly EscrowProof[]): MediaItem[] {
  return proofs.flatMap((proof) =>
    proof.url !== null && isFileProofType(proof.type)
      ? [{ id: proof.id, url: proof.url, type: proof.type }]
      : [],
  )
}
