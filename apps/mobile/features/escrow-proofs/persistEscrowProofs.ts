import { ErrorCode, proofIdentity, type EscrowProofUpload, ApiClientError } from '@tenda/shared'
import { api } from '@/api/client'

/** Save proof identities (urls AND data payloads), resolving a lost response by reading them back. */
export async function persistEscrowProofs(
  escrowId: string,
  proofs: EscrowProofUpload[],
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
