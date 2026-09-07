/**
 * Every string the public feed shows, in one place — the comps write real
 * copy rather than lorem, and it is the part most likely to be reworded by
 * someone who is not editing JSX.
 *
 * Product facts and PITCH strings are NOT written here. This file holds the
 * feed's own mechanical copy — filter labels, empty states, error states. The
 * brand line, the product summary and the guarantee belong to shared
 * `APP_INFO`, and `FeedHero` reads them from there directly, so nothing in
 * this file needs to import it any more.
 */

export const FEED_COPY = {
  /**
   * NO `hero` key. It held a title, lede and eyebrow that nothing ever
   * rendered — a second pitch competing with the three roles shared already
   * owns. `FeedHero` now reads APP_INFO directly; see its header for why.
   */
  rail: {
    search: 'Search',
    // The comp promises "Title, city, trader". `q` is a tsvector over title +
    // description ONLY (server lib/gig-search.ts) — a placeholder naming the
    // city and the poster would send people looking for a match the index
    // cannot make. Spec-correction #12.
    searchPlaceholder: 'Title or brief',
    category: 'Category',
    market: 'Market',
    arrangement: 'Arrangement',
    chain: 'Settles on',
    sort: 'Sort',
    clear: 'Clear all filters',
    apply: 'Apply filters',
    allCategories: 'All categories',
    allMarkets: 'Anywhere',
    allChains: 'Any chain',
    remote: 'Remote only',
    crossBorder: 'Cross-border',
  },
  /**
   * The hero's two calls to action — labels, not pitch strings (those are
   * APP_INFO's). `post` is also the dashboard's, which imports it from here.
   */
  cta: {
    post: 'Post a gig',
    how: 'How escrow works',
  },
  feed: {
    heading: 'Open gigs',
    searchHeading: 'Search results',
    /** The whole filtered set, not this page — see the call site. */
    count: (total: number) => (total === 1 ? '1 gig' : `${total} gigs`),
    /**
     * The LIVE feed facts on the heading's subline (#60): chains from the
     * running registry, markets from the facets, the fee from platform config.
     */
    chains: (count: number) => (count === 1 ? '1 chain' : `${count} chains`),
    markets: (count: number) => (count === 1 ? '1 market' : `${count} markets`),
    fee: (bps: number) => `${bps / 100}% fee`,
    /** The keyboard hint beside the facts, split so the keys render as <kbd>. */
    keyboardHint: { walk: 'walk', open: 'open' },
    amountNote:
      'Amounts are the escrowed net — the fee is already taken out. Cards labelled Apply need the poster’s approval; Accept gigs start the moment you take them.',
  },
  empty: {
    title: 'No gigs match these filters',
    body: 'Nothing is open in this slice right now. Widen the market or clear the category to see the full feed.',
    action: 'Clear filters',
    /** No filters at all and still nothing — a different situation, different words. */
    bareTitle: 'No gigs are open right now',
    bareBody:
      'Every gig here is funded before it is listed, so the feed fills up as posters lock their escrows. Check back shortly.',
  },
  /**
   * Matched rows exist — this page just sits past the last of them.
   *
   * Worded for BOTH ways in, because both are reachable: a stale offset on a
   * searched feed and a spent cursor on the bare one. So it says "this view"
   * rather than "this search", and promises only that nothing was cleared —
   * which is true whether or not anything was set.
   */
  pastEnd: {
    title: 'You are past the last page',
    body: (total: number) =>
      `This view still has ${total === 1 ? '1 gig' : `${total} gigs`} in it, but they all sit on earlier pages — gigs get taken while you browse. Nothing you searched for or filtered has been cleared.`,
    action: 'Back to the first page',
  },
  error: {
    title: 'We could not load the feed',
    body: 'The gig index did not respond. Nothing is wrong with your escrow or your balance — this is a read failure only.',
    action: 'Try again',
  },
  pager: {
    next: 'More gigs',
    previous: 'Previous',
    position: (page: number, pages: number) => `Page ${page} of ${pages}`,
  },
} as const
