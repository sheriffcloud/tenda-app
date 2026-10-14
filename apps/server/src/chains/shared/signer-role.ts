/**
 * The ONE role→bound-address rule of the signer contract, shared by both
 * adapters (each maps its own chain state into `BoundParties`):
 *
 *  - creator actions are bound to the on-chain creator (always set);
 *  - an assigned_counterparty acts as the assignment;
 *  - a counterparty acts as the canonical post-accept binding, else the
 *    pre-accept assignment (an assigned accept/decline must be signed by the
 *    assignee) — and null when the chain holds no binding yet (public
 *    accept: the signature is what CREATES it).
 *
 * Duplicating this per adapter is how the two chains would drift apart on
 * WHO may sign, so the rule lives once here.
 */

export interface BoundParties {
  creator: string
  counterparty: string | null
  assigned_counterparty: string | null
}

export type SignerRole = 'creator' | 'counterparty' | 'assigned_counterparty'

export function boundPartyAddress(caller: SignerRole, parties: BoundParties): string | null {
  if (caller === 'creator') return parties.creator
  if (caller === 'assigned_counterparty') return parties.assigned_counterparty
  return parties.counterparty ?? parties.assigned_counterparty
}
