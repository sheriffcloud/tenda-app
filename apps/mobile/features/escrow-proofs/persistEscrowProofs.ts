import { ErrorCode, proofIdentity, type ProofType } from '@tenda/shared'
import { api, ApiClientError } from '@/api/client'

export interface PersistableProof {
  url: string
  type: ProofType
}

/** Save uploaded proof identities, resolving a lost response by reading them back. */
export async function persistEscrowProofs(
  escrowId: string,
  proofs: PersistableProof[],
): Promise<void> {
  try {
    await api.escrows.addProofs({ id: escrowId }, { proofs })
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.code !== ErrorCode.REQUEST_TIMEOUT) throw error
    const persisted = await api.escrows.proofs({ id: escrowId })
    const persistedIds = new Set(persisted.map(proofIdentity))
    if (!proofs.every((proof) => persistedIds.has(proofIdentity(proof)))) throw error
  }
}
