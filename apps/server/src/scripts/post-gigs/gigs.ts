/**
 * The seed gig book — 20 listings drawn from work that is genuinely bought
 * today (price monitoring, speech data, localisation, field verification).
 *
 * How a run uses this book, and what each amount has to survive, is in
 * `./README.md` — the operator runbook that lives beside the script so the two
 * change in the same commit. The long-form per-gig rationale and the local
 * purchasing-power working are the maintainer's own notes and are deliberately
 * NOT in this repo; this comment used to name their absolute path on one
 * laptop, which is a dead reference for every other reader.
 *
 * TYPED: `GigSeed` is derived from `AgentTaskBody`, so an invalid category,
 * an unknown proof type, or a `structured` requirement without its params is
 * a COMPILE error here. A signed-off JSON book (`--book`, see `book.ts`) has
 * no compiler, so it — and this book too — is run through the server's own
 * validators before anything posts. `--write-book` dumps this one as the
 * starting point for that file.
 *
 * THE PARAM RULE the compiler cannot express, so it is stated here: `proof_params`
 * is required if and only if `proof_requirements` contains `geotag` or
 * `structured`, and refused otherwise (see `parseProofParams`). A geotag radius
 * is measured against the gig's own latitude/longitude, so every geotag listing
 * below carries coordinates.
 *
 * AMOUNTS are the PREVIEW values — deliberately varied to exercise arithmetic
 * rather than volume, including one that forces the fee's floor division. The
 * mainnet run overrides them all with `--amount`.
 */

import { MAX_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
import type { AgentTaskBody } from '@tenda/shared'

/**
 * One listing, minus the fields the runner supplies per run: the operation id
 * (fresh each attempt), and the chain/asset pair (a flag, so the same book
 * seeds Galileo and 0G mainnet without a second copy).
 */
export type GigSeed = Omit<AgentTaskBody, 'creation_operation_id' | 'chain_id' | 'asset'>

/**
 * 30 days — the maximum the API accepts, and the right choice for a seeded
 * book: these listings exist to be browsed and taken by whoever turns up, not
 * to expire over a weekend. Imported rather than written as 2_592_000 so a
 * change to the option set moves this with it.
 */
const ACCEPT_WINDOW = MAX_ACCEPT_WINDOW_SECONDS

/** Time to DO the work once accepted — this is where each gig's urgency lives. */
const HOURS = 3_600

/** City centres, for the geotag radius to be measured from. */
const AT = {
  lagos: { latitude: 6.5244, longitude: 3.3792 },
  ibadan: { latitude: 7.3775, longitude: 3.947 },
  portHarcourt: { latitude: 4.8156, longitude: 7.0498 },
  enugu: { latitude: 6.4402, longitude: 7.4943 },
  abuja: { latitude: 9.0765, longitude: 7.3986 },
  kano: { latitude: 12.0022, longitude: 8.592 },
  kaduna: { latitude: 10.5222, longitude: 7.4383 },
  accra: { latitude: 5.6037, longitude: -0.187 },
  kumasi: { latitude: 6.6885, longitude: -1.6244 },
  nairobi: { latitude: -1.2864, longitude: 36.8172 },
  mombasa: { latitude: -4.0435, longitude: 39.6682 },
  johannesburg: { latitude: -26.2041, longitude: 28.0473 },
  durban: { latitude: -29.8587, longitude: 31.0218 },
  cebu: { latitude: 10.3157, longitude: 123.8854 },
} as const

/** Wide enough for phone GPS error in a dense city, tight enough to mean "there". */
const CITY_RADIUS_M = 25_000

export const GIG_BOOK: readonly GigSeed[] = [
  // ORDERED BY COUNTRY ROUND-ROBIN, NOT GROUPED BY IT.
  //
  // Every consumer of this book takes a PREFIX of it — `--limit 5` for a small
  // mainnet run, and any run cut short by the route's rate limit. Grouped by
  // country, every one of those prefixes was a single country: the first ten
  // gigs were all Nigerian and the whole of the rest of the continent sat in
  // the half that never posted. Interleaving makes a short run representative
  // of the book instead of representative of whichever country sorted first.
  //
  // `book-order.test.ts` holds this: it fails if the first five stop covering
  // five countries, so re-grouping by country cannot land unnoticed.
  //
  // Remote gigs declare no country — there is no place to be — so they carry
  // the spread in their language instead (Pidgin, Twi, Swahili) and are placed
  // after the on-site gigs that anchor each country.
  {
    title: "Photograph today's pump prices at a filling station in Surulere",
    description:
      'Go to any filling station in Surulere and photograph the price board showing today\'s rate per litre. One clear photo is enough. The PMS (petrol) and diesel numbers must be readable without zooming — stand close enough that the digits fill a good part of the frame, and avoid shooting into the sun or through a windscreen. Take it at the station so the geotag matches; a photo taken elsewhere and uploaded later will be rejected. If the board is blank or the station is closed, photograph it anyway and say so — that is still a useful answer and it still gets paid. Do not photograph attendants or customers.',
    category: 'photo',
    country: 'NG',
    city: 'Lagos',
    ...AT.lagos,
    proof_requirements: ['image', 'geotag'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 6 * HOURS,
  },
  {
    title: 'Photograph the rate board at a licensed forex bureau',
    description:
      'Find a licensed forex bureau and photograph its displayed rate board, showing today\'s buy and sell rates for USD against the cedi. The rates must be readable in the photo. Take it at the bureau so the geotag matches. If the board shows several currencies, one photo of the whole board is fine. PRIVACY: photograph the public board only. Do not photograph staff, customers, cash, or transactions, and do not enter to ask for a quote. If anyone asks you to stop, stop, leave, and report why — you will still be paid.',
    category: 'photo',
    country: 'GH',
    city: 'Accra',
    ...AT.accra,
    proof_requirements: ['image', 'geotag'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 6 * HOURS,
  },
  {
    title: 'Current matatu fare on a named route, right now',
    description:
      'Go to the stage named in the gig and find out what the matatu fare on that route is RIGHT NOW. Ask a tout or a driver, or read the board if one is posted. Type the fare in shillings as a plain number, take a photo of the stage or the board, and send it from the stage so the geotag matches. Note the time you asked. If the fare differs by vehicle, give the most common one and say so. Fares swing with fuel, rain and hour of day — a fare from yesterday is worthless here, which is why the completion window is short. You do not need to board.',
    category: 'errand',
    country: 'KE',
    city: 'Nairobi',
    ...AT.nairobi,
    proof_requirements: ['image', 'geotag', 'text'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 4 * HOURS,
  },
  {
    title: 'Photograph the taxi fare board at a named rank',
    description:
      'Photograph the posted fare board at the taxi rank named in the gig, so the routes and prices are readable. Take it at the rank so the geotag matches. SAFETY: ranks can be sensitive to photograph. Photograph the board only — never vehicles, drivers, marshals or passengers. If a marshal asks what you are doing, tell them plainly that you are recording the posted fares. If anyone asks you to stop, stop immediately and leave. Report that instead of the photo and you will be paid in full. No fare data is worth a confrontation.',
    category: 'photo',
    country: 'ZA',
    city: 'Durban',
    ...AT.durban,
    proof_requirements: ['image', 'geotag'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 8 * HOURS,
  },
  {
    title: 'Last three jeepney/bus departure times at a named stop',
    description:
      'Sit at the stop named in the gig and record the departure times of the next three jeepneys or buses on that route — clock time to the minute for each. Send it from the stop so the geotag matches. If three do not come within 45 minutes, record however many did and note how long you waited; that is a valid, paid result and a slow route is itself the finding. You do not need to board.',
    category: 'errand',
    country: 'PH',
    city: 'Cebu City',
    ...AT.cebu,
    proof_requirements: ['geotag', 'structured'],
    proof_params: {
      geotag: { radius_m: CITY_RADIUS_M },
      structured: {
        fields: [
          { name: 'Departure 1 (HH:MM)', kind: 'string', required: true },
          { name: 'Departure 2 (HH:MM)', kind: 'string', required: false },
          { name: 'Departure 3 (HH:MM)', kind: 'string', required: false },
          { name: 'Minutes waited', kind: 'number', required: true },
        ],
      },
    },
    amount_raw: '10000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 4 * HOURS,
  },
  {
    title: 'Cooking gas (LPG) refill price per kg at your nearest depot',
    description:
      'Visit the LPG refill point nearest to you and record what a refill costs per kilogram today. Send one photo of the posted price — a board, a wall, or a handwritten sign is all fine — and type the price per kg as a plain number in naira (for example: 1350). If the depot prices by cylinder size rather than per kg, photograph that list and give the price for a 12.5kg cylinder instead, noting which you used. If prices are not displayed, ask the attendant, type what they quote, and photograph the depot frontage so the location is verifiable. Do not pay for anything.',
    category: 'photo',
    country: 'NG',
    city: 'Ibadan',
    proof_requirements: ['image', 'text'],
    // Approval REQUIRED, deliberately: the seeded book shows BOTH shapes on
    // the feed rather than one. The cost is operational — an agent has no
    // listener, so a submission here waits until someone runs the approve
    // call. Auto-release stays the right default for agent-posted work
    // until the agent notification webhook (#36) exists.
    requires_approval: true,
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 12 * HOURS,
  },
  {
    title: 'Shelf price of a named cooking-oil SKU, two shops',
    description:
      'Find the cooking-oil product named in the gig in TWO different shops in the same market or on the same street, and photograph its shelf price in each. Each photo must show the price and the product together. Record both prices in cedis. The two shops must genuinely be different sellers — two photos of the same shelf will be rejected. If the second shop does not stock it, say so and give the first price only; that is still paid, at the same rate.',
    category: 'photo',
    country: 'GH',
    city: 'Kumasi',
    proof_requirements: ['image', 'structured'],
    proof_params: {
      structured: {
        fields: [
          { name: 'Shop A price (GHS)', kind: 'number', required: true },
          { name: 'Shop B price (GHS)', kind: 'number', required: false },
          { name: 'Second shop stocked it', kind: 'boolean', required: true },
        ],
      },
    },
    // Approval REQUIRED, deliberately: the seeded book shows BOTH shapes on
    // the feed rather than one. The cost is operational — an agent has no
    // listener, so a submission here waits until someone runs the approve
    // call. Auto-release stays the right default for agent-posted work
    // until the agent notification webhook (#36) exists.
    requires_approval: true,
    amount_raw: '2500000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Water-tanker price per drum in your estate',
    description:
      'Find out what a drum of tanker water costs in your estate today. Ask a vendor, a caretaker, or a neighbour who buys it. Type the price in shillings and the drum size in litres (commonly 20L jerrycans or a 200L drum — say which you are quoting). Send it from your estate so the geotag matches. If tanker water is not being sold today, say so and give the last price you know of, noting roughly when. No photo is required and you should not pay for water.',
    category: 'photo',
    country: 'KE',
    city: 'Mombasa',
    ...AT.mombasa,
    proof_requirements: ['geotag', 'structured'],
    proof_params: {
      geotag: { radius_m: CITY_RADIUS_M },
      structured: {
        fields: [
          { name: 'Price (KES)', kind: 'number', required: true },
          { name: 'Drum size in litres', kind: 'number', required: true },
          { name: 'Being sold today', kind: 'boolean', required: true },
        ],
      },
    },
    // Approval REQUIRED, deliberately: the seeded book shows BOTH shapes on
    // the feed rather than one. The cost is operational — an agent has no
    // listener, so a submission here waits until someone runs the approve
    // call. Auto-release stays the right default for agent-posted work
    // until the agent notification webhook (#36) exists.
    requires_approval: true,
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 12 * HOURS,
  },
  {
    title: 'Is this ATM dispensing? Photo of the screen and the queue',
    description:
      'Check one ATM and report whether it is actually dispensing cash right now. Photograph the machine\'s screen — a working menu, an out-of-service message, or a dark screen — and record whether it is dispensing and roughly how many people are waiting. You do not need to withdraw anything. If the ATM is inside a bank hall that is closed, say so; that is a valid answer. PRIVACY: photograph the screen and queue from behind only. Never capture another customer\'s PIN entry, card, or face. If anyone objects or a guard asks you to stop, stop immediately, abandon the photo, and report what happened — you will still be paid.',
    category: 'errand',
    country: 'NG',
    city: 'Port Harcourt',
    ...AT.portHarcourt,
    proof_requirements: ['image', 'geotag', 'structured'],
    proof_params: {
      geotag: { radius_m: CITY_RADIUS_M },
      structured: {
        fields: [
          { name: 'Dispensing cash', kind: 'boolean', required: true },
          { name: 'People waiting (0-10, or 10+)', kind: 'string', required: true },
        ],
      },
    },
    // Approval REQUIRED, deliberately: the seeded book shows BOTH shapes on
    // the feed rather than one. The cost is operational — an agent has no
    // listener, so a submission here waits until someone runs the approve
    // call. Auto-release stays the right default for agent-posted work
    // until the agent notification webhook (#36) exists.
    requires_approval: true,
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 4 * HOURS,
  },
  {
    title: 'Record 20 short phrases in Twi for a speech dataset',
    description:
      'Read 20 short Twi phrases aloud and record yourself; the list comes with the gig. Record somewhere quiet, speak at a normal conversational pace, and leave about a second between phrases — one continuous take with pauses is fine. Hold the phone roughly a hand\'s width from your mouth. Confirm in the text field that you read all 20, and flag any phrase that reads unnaturally in Twi; that feedback is genuinely wanted. Recordings with heavy background noise or clipped words will be rejected.',
    category: 'digital',
    remote: true,
    proof_requirements: ['video', 'text'],
    // Approval REQUIRED: a recording/translation is quality-subjective in a
    // way a price photo is not, so this is where a human check earns its
    // keep. Operational cost: an agent has no listener, so a submission
    // waits until someone runs the approve call (#36 is the fix).
    requires_approval: true,
    amount_raw: '5000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Translate 15 app UI strings from English into Swahili',
    description:
      'Translate 15 short app interface strings from English into Swahili — things like "Sign in", "Your wallet", "Payment received". Return them as a numbered list matching the input numbering, one translation per line. Use the Swahili people actually read in an app in Nairobi, not textbook forms. Keep button labels short: a translation twice the length of the English will not fit the button, so prefer the natural short form. Leave brand names and placeholders like {amount} untouched. If a string is ambiguous without context, translate your best reading and add a short note. Machine translation pasted unedited will be rejected.',
    category: 'digital',
    remote: true,
    proof_requirements: ['text'],
    // Approval REQUIRED: a recording/translation is quality-subjective in a
    // way a price photo is not, so this is where a human check earns its
    // keep. Operational cost: an agent has no listener, so a submission
    // waits until someone runs the approve call (#36 is the fix).
    requires_approval: true,
    amount_raw: '3000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Confirm this shop still trades at this address',
    description:
      'Go to the address given in the gig and confirm whether that business is still operating there. Photograph the storefront so the name on the signage is readable, standing outside the premises so the geotag matches. Then say which of these it is: open and trading, closed but clearly still the same business, replaced by a different business, or the premises are empty. If it has been replaced, photograph the new signage — that is the most valuable answer of the four. You do not need to go inside or speak to anyone.',
    category: 'errand',
    country: 'NG',
    city: 'Enugu',
    ...AT.enugu,
    proof_requirements: ['image', 'geotag'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '2500000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Call a listed business and confirm its opening hours',
    description:
      'Call the business number given in the gig and confirm its current opening hours. Record whether anyone answered, what hours you were told, and whether the number is still in service at all. Be brief and polite — say you are checking their listed opening hours, thank them, and end the call. Do not place an order, ask for a quote, or pretend to be a customer. If nobody answers, try once more later in the window and record that; "no answer, tried twice" is a valid, paid result. If the number is disconnected, that is the most valuable answer.',
    category: 'service',
    remote: true,
    proof_requirements: ['structured'],
    proof_params: {
      structured: {
        fields: [
          { name: 'Someone answered', kind: 'boolean', required: true },
          { name: 'Opening hours as stated', kind: 'string', required: false },
          { name: 'Number still in service', kind: 'boolean', required: true },
        ],
      },
    },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Queue length at the passport office, 9am sharp',
    description:
      'At 9:00am, record how long the queue is at the passport office named in the gig. Photograph the queue from a distance — a wide shot showing its length, not individual faces — and record roughly how many people are waiting and whether the gate is open and admitting people. Timing is the whole point: a report from 11am is not a substitute and will be rejected. Only take this gig if you are going there anyway; travelling to the office for this fee is not worth your time.',
    category: 'errand',
    country: 'NG',
    city: 'Abuja',
    proof_requirements: ['image', 'structured'],
    proof_params: {
      structured: {
        fields: [
          { name: 'People waiting (under 20 / 20-50 / 50-100 / 100+)', kind: 'string', required: true },
          { name: 'Gate open and admitting', kind: 'boolean', required: true },
          { name: 'Time observed (HH:MM)', kind: 'string', required: true },
        ],
      },
    },
    amount_raw: '2500000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 12 * HOURS,
  },
  {
    title: 'Test a signup flow on Android and report what breaks',
    description:
      'Open the app link in the gig on an Android phone and try to create an account, right through to the first screen after signup. Report up to three things that went wrong or confused you — one line each, plus a screenshot for any you can capture. "Confusing" counts: a button you could not find, a message you did not understand, a step that felt too long. If nothing broke, say so and tell us the slowest or most annoying step; that is a valid, paid result. Use a throwaway email if you prefer. Do not enter real payment details — you will never be asked to.',
    category: 'digital',
    remote: true,
    proof_requirements: ['image', 'text'],
    // 1.000001 USDC — the FLOOR-DIVISION case. The true 2.5% fee is 25000.025,
    // and `_fee` is integer division, so the contract takes 25000 and the
    // remainder falls to the worker. This listing exists to prove the server's
    // fee projection agrees with the contract rather than rounding.
    amount_raw: '1000001',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Is the public borehole/tap flowing today?',
    description:
      'Check the public water point nearest to you and report whether it is flowing today. Photograph the tap or borehole head — ideally with water running, if it is — and record whether water is coming out and whether anyone is charging for it. Take the photo at the water point so the geotag matches. If there is a queue, do not jump it; photograph from where you are standing. If the point has been removed or sealed, that is a valuable answer — photograph it and say so.',
    category: 'photo',
    country: 'NG',
    city: 'Kano',
    ...AT.kano,
    proof_requirements: ['image', 'geotag', 'structured'],
    proof_params: {
      geotag: { radius_m: CITY_RADIUS_M },
      structured: {
        fields: [
          { name: 'Water flowing', kind: 'boolean', required: true },
          { name: 'A fee is charged', kind: 'boolean', required: true },
          { name: 'Fee amount in NGN (0 if free)', kind: 'number', required: false },
        ],
      },
    },
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 8 * HOURS,
  },
  {
    title: 'Transcribe a 2-minute Nigerian Pidgin voice note into text',
    description:
      'You will receive a two-minute voice note in Nigerian Pidgin. Type out exactly what is said, in Pidgin — do NOT translate it into standard English. Write it the way it sounds ("dey", "wetin", "abeg"); there is no official spelling and consistency matters more than correctness. Include filler words and repetitions. If a stretch is genuinely inaudible, write [unclear] rather than guessing. Mark a change of speaker on a new line. No timestamps needed. A transcript translated into English, or run through a machine tool and left uncorrected, will be rejected.',
    category: 'digital',
    remote: true,
    proof_requirements: ['text'],
    amount_raw: '3000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Photograph the shelf price of a named 1kg rice brand',
    description:
      'In any supermarket or provisions shop, find the 1kg pack of the rice brand named in the gig and photograph its shelf price. The photo must show the price label and the product together in one frame — a price tag alone cannot be matched to a product, and will be rejected. Then type the price in naira as a plain number. If that exact brand is out of stock, photograph the empty shelf space with its label and type "out of stock"; that is a useful answer and is paid. Do not buy anything.',
    category: 'photo',
    country: 'NG',
    city: 'Kaduna',
    proof_requirements: ['image', 'text'],
    amount_raw: '2000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Record 20 short phrases in Yoruba for a speech dataset',
    description:
      'Read 20 short Yoruba phrases aloud and record yourself; the phrase list is supplied with the gig. Record in the quietest room you have — no TV, no generator, no street noise if you can help it. Speak at a normal conversational pace, not slowly or theatrically. Leave about a second of silence between phrases; one continuous take with pauses is fine, you do not need 20 separate clips. Hold the phone about a hand\'s width from your mouth. Then confirm in the text field that you read all 20, and note any you skipped and why. Recordings with heavy background noise or clipped first words will be rejected.',
    category: 'digital',
    remote: true,
    proof_requirements: ['video', 'text'],
    amount_raw: '5000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 24 * HOURS,
  },
  {
    title: 'Hand-deliver an envelope within the same street in Yaba',
    description:
      'Collect a sealed envelope from the pickup point named in the gig and hand it to the named recipient at an address on the same street. Both points are within walking distance — if you find they are not, do not accept, and tell us. Photograph the handover: the envelope with the recipient\'s door, desk, or a signed receipt. Do not open the envelope. If the recipient is not there, do not leave it with anyone else — return it to the pickup point and report that; you will still be paid.',
    category: 'delivery',
    country: 'NG',
    city: 'Lagos',
    ...AT.lagos,
    proof_requirements: ['image', 'geotag'],
    proof_params: { geotag: { radius_m: CITY_RADIUS_M } },
    amount_raw: '3000000',
    accept_window_seconds: ACCEPT_WINDOW,
    completion_duration_seconds: 3 * HOURS,
  },
]
