/**
 * Example gigs surfaced by the tasks-wall ticker, the app-screen mock-ups and
 * the product sheet.
 * EDIT THE SEEDS BELOW to add or change showcased tasks — they are the single
 * source for every example gig on the landing. Amounts are USDC (the gig asset
 * on every supported chain). Titles are bounded by MAX_TITLE_LENGTH below, so
 * cards never wrap.
 *
 * EVERY LOCATION IS A MARKET WE ACTUALLY SETTLE IN. A seed names a country by
 * ISO code, and the code must exist in the shared payout registry — the same
 * specs the server validates a payout account against. A sample gig in a city
 * whose worker could not cash out is a promise the product cannot keep, and
 * "somewhere plausible" is exactly how that gets typed in. `null` means the
 * work is remote and has no location claim to make.
 *
 * FLAGS ARE DERIVED from that country code, not typed per row: thirty-odd rows
 * each carrying their own flag emoji is thirty-odd chances to pair Lagos with
 * the wrong one.
 *
 * WHAT THE MIX IS FOR. Roughly a third of these are work an AGENT would
 * commission rather than a person — storefront verification, ground-truth
 * price collection, accented-speech capture, real-device QA on a real network,
 * culturally-specific ranking. That is the ROADMAP's Phase 2 ("The Human API")
 * shown rather than described, and it is chosen deliberately: every one of
 * them is something software cannot do for itself, needs a body or local
 * knowledge to complete, and settles on a small verifiable proof — a photo, a
 * recording, a geotag. They are NOT badged as agent-origin. Agent-posted tasks
 * carrying an origin badge is Phase 2 and has not shipped; a badge here would
 * advertise it as if it had. Each of these is equally postable by a person
 * today, which is what makes showing them honest.
 */

import { SUPPORTED_PAYOUT_COUNTRIES } from '@tenda/shared/fiat/payout'
import type { CategoryId } from './categories'

/** ISO 3166-1 alpha-2 of a market the payout registry settles, or null = remote. */
export type TaskCountry = string | null

/**
 * Flag per payout market, plus the globe used for remote work.
 *
 * Landing-only display, keyed by the registry's country codes — the same
 * convention `chains.ts` uses for brand colour and `categories.ts` for chip
 * emoji. A market added to the registry without a flag here is caught by a
 * test rather than rendering a blank square.
 */
const COUNTRY_FLAG: Readonly<Record<string, string>> = {
  NG: '🇳🇬',
  KE: '🇰🇪',
  GH: '🇬🇭',
  ZA: '🇿🇦',
  PH: '🇵🇭',
  AE: '🇦🇪',
}

/**
 * The widest a title can be before a ticker card wraps and breaks its row.
 *
 * Named here rather than left as prose plus a literal in the test: the rule was
 * stated as "under ~40 chars" in this docstring while showcase.test.ts asserted
 * 45, so a 44-character title broke the documented rule and passed the guard
 * meant to enforce it. One value, imported by the test.
 */
export const MAX_TITLE_LENGTH = 40

/** Shown for `country: null`. Remote work names no market. */
export const REMOTE_FLAG = '🌍'
export const REMOTE_CITY = 'Remote'

export interface ExampleTask {
  id: string
  category: CategoryId
  title: string
  amountUsdc: number
  city: string
  country: TaskCountry
  flag: string
  /** Human time-left label shown on the card. */
  countdown: string
}

type TaskSeed = Omit<ExampleTask, 'flag'>

const TASK_SEEDS: readonly TaskSeed[] = [
  // ── Everyday gigs ──────────────────────────────────────────────────
  { id: 't-01', category: 'delivery', title: 'Pick up a package · Lekki Phase 1', amountUsdc: 12, city: 'Lagos',        country: 'NG',   countdown: '45m left' },
  { id: 't-02', category: 'photo',    title: 'Event photographer · 2 hours',      amountUsdc: 35, city: 'Nairobi',      country: 'KE',   countdown: '4h left'  },
  { id: 't-03', category: 'service',  title: 'Fix a leaking kitchen tap',         amountUsdc: 20, city: 'Accra',        country: 'GH',   countdown: '2d left'  },
  { id: 't-04', category: 'errand',   title: 'Drop off documents · Sandton',      amountUsdc: 8,  city: 'Johannesburg', country: 'ZA',   countdown: '1h left'  },
  { id: 't-05', category: 'digital',  title: 'Edit a 90-second product reel',     amountUsdc: 40, city: REMOTE_CITY,    country: null,   countdown: '6h left'  },
  { id: 't-06', category: 'delivery', title: 'Same-day pharmacy run',             amountUsdc: 7,  city: 'Makati',       country: 'PH',   countdown: '1h left'  },
  { id: 't-07', category: 'service',  title: 'Service two split-unit ACs',        amountUsdc: 45, city: 'Dubai',        country: 'AE',   countdown: '1d left'  },
  { id: 't-08', category: 'errand',   title: 'Queue for a visa appointment',      amountUsdc: 18, city: 'Abu Dhabi',    country: 'AE',   countdown: '3h left'  },
  { id: 't-09', category: 'photo',    title: 'Shoot 20 product photos',           amountUsdc: 25, city: 'Cebu',         country: 'PH',   countdown: '8h left'  },
  { id: 't-10', category: 'digital',  title: 'Subtitle a 5-minute video',         amountUsdc: 13, city: REMOTE_CITY,    country: null,   countdown: '18h left' },
  { id: 't-11', category: 'delivery', title: 'Bike a laptop across town · Ikeja', amountUsdc: 11, city: 'Lagos',        country: 'NG',   countdown: '25m left' },
  { id: 't-12', category: 'service',  title: 'Assemble a flat-pack wardrobe',     amountUsdc: 22, city: 'Cape Town',    country: 'ZA',   countdown: '5h left'  },
  { id: 't-13', category: 'errand',   title: 'Grocery run · Divisoria market',    amountUsdc: 7,  city: 'Manila',       country: 'PH',   countdown: '40m left' },
  { id: 't-14', category: 'photo',    title: 'Drone shots of a building site',    amountUsdc: 60, city: 'Nairobi',      country: 'KE',   countdown: '3d left'  },
  { id: 't-15', category: 'digital',  title: 'Fix a broken Shopify checkout',     amountUsdc: 50, city: REMOTE_CITY,    country: null,   countdown: '1d left'  },
  { id: 't-16', category: 'service',  title: 'Deep-clean a 2-bed apartment',      amountUsdc: 30, city: 'Accra',        country: 'GH',   countdown: '1d left'  },
  { id: 't-17', category: 'delivery', title: 'Deliver catering trays',            amountUsdc: 14, city: 'Quezon City',  country: 'PH',   countdown: '2h left'  },
  { id: 't-18', category: 'errand',   title: 'Collect a parcel from customs',     amountUsdc: 16, city: 'Sharjah',      country: 'AE',   countdown: '4h left'  },
  { id: 't-19', category: 'photo',    title: 'Cover a launch · 40 photos',        amountUsdc: 55, city: 'Dubai',        country: 'AE',   countdown: '2d left'  },
  { id: 't-20', category: 'service',  title: 'Install two ceiling fans',          amountUsdc: 24, city: 'Abuja',        country: 'NG',   countdown: '7h left'  },
  { id: 't-21', category: 'digital',  title: 'Set up a WhatsApp Business catalog', amountUsdc: 16, city: REMOTE_CITY,   country: null,   countdown: '2d left'  },
  { id: 't-22', category: 'service',  title: 'Repair a washing machine',          amountUsdc: 32, city: 'Sharjah',      country: 'AE',   countdown: '1d left'  },
  { id: 't-23', category: 'delivery', title: 'Courier documents · BGC',           amountUsdc: 9,  city: 'Taguig',       country: 'PH',   countdown: '90m left' },

  // ── Work software cannot do for itself ─────────────────────────────
  // Physical presence, local ground truth, human judgement — each with a
  // small, checkable proof. See the note at the top of this file.
  { id: 't-24', category: 'photo',    title: 'Photograph this storefront · Deira', amountUsdc: 6, city: 'Dubai',        country: 'AE',   countdown: '5h left'  },
  { id: 't-25', category: 'errand',   title: 'Record 10 market prices · Balogun',  amountUsdc: 9, city: 'Lagos',        country: 'NG',   countdown: '6h left'  },
  { id: 't-26', category: 'photo',    title: 'Verify a billboard is up · Al Quoz', amountUsdc: 8, city: 'Dubai',        country: 'AE',   countdown: '3h left'  },
  { id: 't-27', category: 'errand',   title: 'Call 15 shops, confirm they’re open', amountUsdc: 12, city: 'Cebu',       country: 'PH',   countdown: '1d left'  },
  { id: 't-28', category: 'digital',  title: 'Record 50 phrases · Nigerian accent', amountUsdc: 20, city: 'Port Harcourt', country: 'NG', countdown: '2d left' },
  { id: 't-29', category: 'digital',  title: 'Translate 200 lines to spoken Pidgin', amountUsdc: 28, city: REMOTE_CITY, country: null,  countdown: '3d left'  },
  { id: 't-30', category: 'photo',    title: 'Photograph 30 storefront signs',     amountUsdc: 18, city: 'Davao',       country: 'PH',   countdown: '2d left'  },
  { id: 't-31', category: 'digital',  title: 'Test checkout on a low-end Android', amountUsdc: 22, city: 'Nairobi',     country: 'KE',   countdown: '12h left' },
  { id: 't-32', category: 'digital',  title: 'Rank 20 product photos for shoppers', amountUsdc: 10, city: 'Manila',     country: 'PH',   countdown: '8h left'  },
  { id: 't-33', category: 'errand',   title: 'Confirm a delivery arrived intact',  amountUsdc: 5,  city: 'Durban',      country: 'ZA',   countdown: '90m left' },
]

/**
 * The flag for a seed's market, or the globe when the work is remote.
 *
 * OWN properties only, for the reason `transportFor` documents: an inherited
 * key like 'toString' or 'constructor' is truthy, so `?? REMOTE_FLAG` never
 * fired and this returned a function where its signature promises a string.
 */
export function flagFor(country: TaskCountry): string {
  if (country === null) return REMOTE_FLAG
  return Object.hasOwn(COUNTRY_FLAG, country) ? COUNTRY_FLAG[country] : REMOTE_FLAG
}

export const EXAMPLE_TASKS: readonly ExampleTask[] = TASK_SEEDS.map((seed) => ({
  ...seed,
  flag: flagFor(seed.country),
}))

/** Payout markets a showcased gig names, for the test that pins them to the registry. */
export const TASK_COUNTRIES: readonly string[] = [
  ...new Set(TASK_SEEDS.map((t) => t.country).filter((c): c is string => c !== null)),
]

/** Every market the registry settles — what TASK_COUNTRIES is checked against. */
export const PAYOUT_MARKET_CODES: readonly string[] = SUPPORTED_PAYOUT_COUNTRIES
