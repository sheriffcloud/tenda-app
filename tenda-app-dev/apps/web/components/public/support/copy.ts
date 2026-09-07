/**
 * Support-centre strings. Topic titles and blurbs are NOT here — those are
 * shared `SUPPORT_TOPICS`, the cross-client vocabulary; only the chrome around
 * them lives in this app.
 */
import { SUPPORT_TOPICS } from '@tenda/shared'

export const SUPPORT_COPY = {
  eyebrow: 'Support',
  /**
   * The comp's own words. There is no index heading in shared — `SUPPORT_TOPICS`
   * names the topics, not the page around them — so nothing conflicts and the
   * comp wins, which is the rule for copy the product has no other source for.
   * (An earlier draft of this file invented its own; that was the error.)
   */
  indexHeading: 'Answers about escrow, gigs and payouts',
  /**
   * The comp writes "Six short guides". The count is DERIVED so the sentence
   * cannot outlive the vocabulary — adding a seventh topic to shared would
   * otherwise leave this page quietly lying about how many there are.
   */
  indexIntro: `${SUPPORT_TOPICS.length} short guides covering the parts of the product people ask about most. Nothing here needs an account.`,
  navLabel: 'All guides',
  /** The aside's index entry — SUPPORT_TOPICS covers only the topics. */
  navIndex: 'Support home',
  /**
   * The comp's footnote reads "Signed-in users can open a support thread from
   * Settings". There is NO support thread: Settings' only support affordance
   * is a link to /support, so following that sentence walks a stuck reader in
   * a circle back to the page they were already on. The comp is describing a
   * feature the product does not have — behaviour wins, including on which
   * surfaces exist at all.
   *
   * The real channels are the two in shared `APP_INFO.support`, and they are
   * named here rather than only on the FAQ page: someone stuck on the wallet
   * guide is exactly as stuck as someone stuck on the FAQ, and this rail is on
   * every support page. (The FAQ page carried the email before #13 and the
   * port dropped it — this is where it comes back.)
   */
  stuckNote: 'Still stuck? No account needed to ask a person:',
} as const
