import type { GigDetail, GigSummary, UserRef } from '@tenda/shared'

/**
 * Typed against the REAL wire types — a fixture that stops typechecking is a
 * stub API that lies. LEAKED_* sentinels mark party-scoped values: the stub
 * serves them ON PURPOSE (a hostile-server stance) and the e2e asserts the
 * anonymous pages never render them, proving the page treats party fields as
 * absent rather than trusting the server to withhold them.
 *
 * Everything shared between the stub and the specs lives here, and not in
 * stub-api.ts, because that module opens a listener at import time — importing
 * even a constant from it boots a second stub and the run dies on EADDRINUSE.
 */

/**
 * Search term the stub answers with a 500, so a spec can exercise the
 * feed-is-down path. Keyed off the QUERY rather than a server flag to keep the
 * suite parallel-safe: only the request that asks for it fails.
 */
export const E2E_FAIL_QUERY = '__e2e_feed_down__'

/** Gig id the stub answers with a 500, for the detail route's outage path. */
export const E2E_FAIL_GIG_ID = '__e2e_gig_down__'

export const LEAKED_COUNTERPARTY_NAME = 'LEAKED-COUNTERPARTY-NAME'
export const LEAKED_COUNTERPARTY_ID = 'leaked-counterparty-id-000'

const poster: UserRef = {
  id: 'user-poster-1',
  first_name: 'Ada',
  last_name: 'Okafor',
  avatar_url: null,
  review_score: '4.80',
  is_seeker: false,
  is_agent: false,
  country: 'NG',
}

export const deliveryGig: GigSummary = {
  escrow_id: 'gig-delivery-1',
  public_feed_revision: '1',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '25000000',
  status: 'open',
  accept_deadline: '2030-01-01T12:00:00.000Z',
  created_at: '2026-08-15T08:00:00.000Z',
  title: 'Deliver a parcel across Yaba',
  description: 'Pick up a sealed parcel in Yaba and deliver it to Lekki before 5pm.',
  category: 'delivery',
  country: 'NG',
  city: 'Lagos',
  latitude: null,
  longitude: null,
  remote: false,
  cross_border: false,
  proof_requirements: ['image'],
  proof_params: null,
  requires_approval: false,
  creator: poster,
}

/**
 * The AGENT-posted gig. Posted by software, so `is_agent` is true — which is
 * what puts the shared badge on this card wherever the feed renders, including
 * the width sweep in public-discovery.spec.ts. Without one agent poster in the
 * fixtures, that badge ships on the anonymous front door and no measurement at
 * 320-1280px ever includes it, while the row it joins is the one whose widths
 * this suite exists to pin.
 */
export const photoGig: GigSummary = {
  ...deliveryGig,
  // The name shape a REAL agent has: `registerAgent` puts the whole `name`
  // into `first_name` and leaves `last_name` empty, so an agent with a surname
  // is a shape the producer cannot emit — and this is also the only fixture
  // anywhere that renders a poster through `formatFullName` with a blank half.
  creator: { ...poster, id: 'user-agent-1', first_name: 'Dispatch Bot', last_name: '', is_agent: true },
  escrow_id: 'gig-photo-1',
  asset: 'USDC_BASE',
  chain_id: 'eip155:84532',
  amount_raw: '120000000',
  title: 'Edit a 30-second product reel',
  description: 'Remote edit of raw footage into a 30s reel.',
  category: 'photo',
  city: null,
  country: null,
  remote: true,
  requires_approval: true,
}

/**
 * The same hostile-server stance, applied to CONTENT rather than to
 * party-scoped fields: title, description and city are all poster-written, and
 * a poster pasting a link into a title is ordinary, not exotic.
 *
 * Every one of these values broke the public layout before the fix — the feed
 * card grew to its longest unbreakable token and dragged the grid track out
 * with it (+474px of document overflow at 360px, still +30px at 1100px), and
 * the detail page's Location term painted 176px outside its column. The city is
 * a real place name; the URL is the shape of a maps link.
 */
const PASTED_URL =
  'https://example.com/some/extremely/long/path/that/a/poster/pasted/into/the/title/field?utm_source=whatsapp&utm_campaign=deliver-now'
export const LONGEST_PLACE = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch'

export const unbreakableGig: GigSummary = {
  ...deliveryGig,
  escrow_id: 'gig-unbreakable-1',
  title: `Deliver to ${PASTED_URL}`,
  description: `${PASTED_URL}\n\nCall me on arrival.`,
  city: LONGEST_PLACE,
  requires_approval: true,
}

export const deliveryGigDetail: GigDetail = {
  ...deliveryGig,
  hidden: false,
  completion_duration_seconds: 86_400,
  completion_deadline: null,
  submitted_at: null,
  approval_deadline: null,
  my_signer_address: null,
  dispute_bond_raw: '1000000',
  // Party-scoped, hostile-server values — must never appear in anonymous HTML.
  assigned_counterparty_id: LEAKED_COUNTERPARTY_ID,
  is_assigned: false,
  unassign_window_seconds: 3600,
  assignment_released_at: null,
  counterparty: {
    id: LEAKED_COUNTERPARTY_ID,
    first_name: LEAKED_COUNTERPARTY_NAME,
    last_name: 'LEAKED-SURNAME',
    avatar_url: null,
    review_score: null,
    is_seeker: false,
    is_agent: false,
    country: 'NG',
  },
  proofs: [],
  dispute: null,
  reviews: [
    {
      id: 'review-gig-delivery-1',
      escrow_id: deliveryGig.escrow_id,
      reviewer_id: poster.id,
      reviewee_id: LEAKED_COUNTERPARTY_ID,
      score: 5,
      comment: 'Careful work and clear updates.',
      created_at: '2026-08-16T09:00:00Z',
    },
  ],
  is_seeker: false,
  viewer: null,
}

/** The unbreakable-content gig as a DETAIL, for the /gig/[id] layout check. */
export const unbreakableGigDetail: GigDetail = {
  ...deliveryGigDetail,
  ...unbreakableGig,
  assigned_counterparty_id: null,
  counterparty: null,
}
