/**
 * §02 Tasks wall — header copy only. The showcased tasks themselves live in
 * src/content/tasks.ts (edit there to add more).
 */

import { GIG_ASSET_SYMBOL } from '@/content'

export const TASK_WALL_HEADER = {
  eyebrow: 'What gets done on Tenda',
  aside: `Posted in local terms · paid in ${GIG_ASSET_SYMBOL}`,
  h2: ['If someone can do it,', 'someone will post it'],
  // The second half names the work an AGENT would commission — see the note
  // at the top of content/tasks.ts on why a third of the seeds are that.
  sub: 'Deliveries, photoshoots, queues stood in, taps fixed, reels edited — and the work software cannot do for itself: a storefront photographed, ground-truth prices collected, an accent recorded, checkout tested on a real low-end phone.',
  /** The live chip closing the category row. */
  marketsNote: 'Every city shown is a market we settle cash in',
} as const
