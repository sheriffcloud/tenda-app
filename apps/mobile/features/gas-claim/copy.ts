/**
 * Every word the gas-claim surface says, in one place.
 *
 * There is ONE surface now: a chip on the balance row of a chain with no gas
 * (#100). It is rendered only when a claim is actually available, which is why
 * this file no longer maps states and reasons to sentences.
 *
 * IT USED TO, and the removal is the point rather than a tidy-up. The old card
 * described every refusal — `phone_required`, `funder_empty`, `already_granted`
 * — as standing text on the wallet screen, so a user who could not claim was
 * shown a permanent explanation of why. Those sentences still exist and are
 * still good; they live on the SERVER, where `claimRefusal` writes one per
 * reason and returns it from the tap that earned it. A refusal is an answer to
 * an action, not a notice to live under someone's balances.
 *
 * What remains is what a chip can say: its label, its accessible name, and the
 * one sentence needed when a claim fails with no message of its own.
 */

export const GAS_CLAIM_COPY = {
  /**
   * The chip's label. Two words, because it sits at the end of a balance row
   * beside a figure like "0.0000 0G" and has to read at a glance without
   * crowding it.
   *
   * A BENEFIT, not a mechanism: "Get gas" says what the user ends up with,
   * where "Claim grant" would ask them to know what a grant is first.
   */
  chip: 'Get gas',
  /**
   * The accessible name, which is allowed to be longer than the visible label
   * because a screen reader has no width limit — and "Get gas" alone, announced
   * out of context, does not say gas for WHAT. The chain id is appended by the
   * component.
   */
  action: 'Claim gas',
  /**
   * The fallback when a claim fails with no message of its own — a dropped
   * connection, a timeout. The server's own message is preferred wherever there
   * is one, because it names the actual refusal ("verify your phone number").
   *
   * Without this a network failure said NOTHING: the chip stopped spinning and
   * the row looked unchanged, which reads as a tap that never registered.
   */
  failed: 'That did not go through. Try again in a moment.',
} as const
