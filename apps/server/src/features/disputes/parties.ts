/**
 * Party assembly shared by the admin escrow dossier and the mediation-thread
 * context. Single source for the "creator-first, accepted-or-assigned
 * counterparty" derivation so the two surfaces can never drift.
 *
 * Vocabulary is structural creator|counterparty — the same words the on-chain
 * `winner` enum and resolve flow use. The accepted counterparty is
 * authoritative; a pre-assigned-but-never-accepted escrow falls back to
 * assigned_counterparty_id so the party is still named. The counterparty is
 * omitted only when neither id exists.
 */
import type { DossierParty } from '@tenda/shared'

/** Minimal identity projection used to resolve a party's display name. */
export interface PartyIdentity {
  id: string
  first_name: string | null
  last_name: string | null
}

/** The escrow columns that identify the two parties. */
export interface PartyEscrow {
  creator_id: string
  counterparty_id: string | null
  assigned_counterparty_id: string | null
}

/** The effective counterparty id (accepted, else pre-assigned), or null. */
export function counterpartyIdOf(escrow: PartyEscrow): string | null {
  return escrow.counterparty_id ?? escrow.assigned_counterparty_id
}

/** Deduped, non-null party ids (creator + effective counterparty). */
export function partyIdsOf(escrow: PartyEscrow): string[] {
  const counterpartyId = counterpartyIdOf(escrow)
  return [escrow.creator_id, counterpartyId].filter((id): id is string => id !== null)
}

/** Ordered creator-first party list, names resolved from `identities`. */
export function deriveDisputeParties(
  escrow: PartyEscrow,
  raisedById: string | null,
  identities: PartyIdentity[],
): DossierParty[] {
  const nameOf = (id: string): PartyIdentity | null =>
    identities.find((u) => u.id === id) ?? null

  const creator = nameOf(escrow.creator_id)
  const parties: DossierParty[] = [
    {
      role: 'creator',
      user_id: escrow.creator_id,
      first_name: creator?.first_name ?? null,
      last_name: creator?.last_name ?? null,
      raised_dispute: raisedById === escrow.creator_id,
    },
  ]

  const counterpartyId = counterpartyIdOf(escrow)
  if (counterpartyId !== null) {
    const cp = nameOf(counterpartyId)
    parties.push({
      role: 'counterparty',
      user_id: counterpartyId,
      first_name: cp?.first_name ?? null,
      last_name: cp?.last_name ?? null,
      raised_dispute: raisedById === counterpartyId,
    })
  }

  return parties
}
