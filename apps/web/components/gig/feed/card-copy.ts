/**
 * Card strings. Separate from FEED_COPY because the card is reused outside
 * the feed (search results, a poster's other listings) and should not drag
 * the hero and the empty states along with it.
 */
export const GIG_CARD_COPY = {
  /** Approval mode: the poster picks from applications. */
  apply: 'Apply',
  /** Direct mode: taking it starts the work. */
  accept: 'Accept',
  open: 'Open',
  closingSoon: 'Closing soon',
  ratingLabel: (score: string) => `Rated ${score} out of 5`,
} as const

/**
 * The chip naming how a gig is TAKEN, derived from the wire fact in ONE
 * place — the feed card and the workspace row both show it while browsing,
 * and two ternaries over the same flag is how the words drift apart.
 */
export function gigTakeVerb(requiresApproval: boolean): string {
  return requiresApproval ? GIG_CARD_COPY.apply : GIG_CARD_COPY.accept
}
