/**
 * Dossier copy. The money note is the important one: it has to say that the
 * figure is what the chain attested, NOT a projection, or a reader will
 * reasonably assume a fee still has to come off it.
 */
export const DOSSIER_COPY = {
  amountLabel: 'Locked in escrow',
  /**
   * `amount_raw` is the chain-attested NET — the platform fee is already out.
   * Saying so is not decoration: the alternative is a reader doing arithmetic
   * that has already been done, and disputing the difference.
   */
  amountNote:
    'Attested on-chain, net of the platform fee. This is what is released when the gig completes.',
  facts: 'Terms',
  counterparty: 'Counterparty',
  proofs: 'Evidence',
  noProofs: 'No evidence attached yet.',
  /** Shown to a party when the gig names an assignee but they cannot see who. */
  assignedUnnamed: 'This gig is assigned to someone.',
} as const
