/**
 * Example gigs surfaced by the hero TaskDeck and the tasks-wall marquee.
 * EDIT THIS FILE to add or change showcased tasks — it is the single source
 * for every example gig on the landing. Amounts are USDC (the gig asset on
 * every supported chain). Keep titles under ~40 chars so cards never wrap.
 */

import type { CategoryId } from '@/data/categories'

export interface ExampleTask {
  id: string
  category: CategoryId
  title: string
  amountUsdc: number
  city: string
  flag: string
  /** Human time-left label shown on the card. */
  countdown: string
}

export const EXAMPLE_TASKS: readonly ExampleTask[] = [
  { id: 't-01', category: 'delivery', title: 'Pick up a package · Lekki Phase 1',    amountUsdc: 12, city: 'Lagos',        flag: '🇳🇬', countdown: '45m left' },
  { id: 't-02', category: 'photo',    title: 'Event photographer · 2 hours',        amountUsdc: 35, city: 'Nairobi',      flag: '🇰🇪', countdown: '4h left' },
  { id: 't-03', category: 'service',  title: 'Fix a leaking kitchen tap',           amountUsdc: 20, city: 'Accra',        flag: '🇬🇭', countdown: '2d left' },
  { id: 't-04', category: 'errand',   title: 'Drop off documents · Sandton',        amountUsdc: 8,  city: 'Johannesburg', flag: '🇿🇦', countdown: '1h left' },
  { id: 't-05', category: 'digital',  title: 'Edit a 90-second product reel',       amountUsdc: 40, city: 'Lagos',        flag: '🇳🇬', countdown: '6h left' },
  { id: 't-06', category: 'service',  title: 'Move a 2-seater couch to Yaba',       amountUsdc: 15, city: 'Lagos',        flag: '🇳🇬', countdown: '30m left' },
  { id: 't-07', category: 'errand',   title: 'Queue at the passport office',        amountUsdc: 10, city: 'Abuja',        flag: '🇳🇬', countdown: '3h left' },
  { id: 't-08', category: 'delivery', title: 'Deliver wedding cards · Westlands',   amountUsdc: 9,  city: 'Nairobi',      flag: '🇰🇪', countdown: '2h left' },
  { id: 't-09', category: 'digital',  title: 'Design a flyer for Friday’s event',   amountUsdc: 18, city: 'Accra',        flag: '🇬🇭', countdown: '1d left' },
  { id: 't-10', category: 'photo',    title: 'Shoot 20 product photos for a store', amountUsdc: 25, city: 'Kumasi',       flag: '🇬🇭', countdown: '8h left' },
  { id: 't-11', category: 'service',  title: 'Assemble an IKEA-style wardrobe',     amountUsdc: 22, city: 'Cape Town',    flag: '🇿🇦', countdown: '5h left' },
  { id: 't-12', category: 'errand',   title: 'Grocery run from the night market',   amountUsdc: 7,  city: 'Manila',       flag: '🇵🇭', countdown: '40m left' },
  { id: 't-13', category: 'digital',  title: 'Translate a menu to French',          amountUsdc: 12, city: 'Remote',       flag: '🌍', countdown: '12h left' },
  { id: 't-14', category: 'delivery', title: 'Bike a laptop across town · Ikeja',   amountUsdc: 11, city: 'Lagos',        flag: '🇳🇬', countdown: '25m left' },
  { id: 't-15', category: 'photo',    title: 'Drone shots of a building site',      amountUsdc: 60, city: 'Nairobi',      flag: '🇰🇪', countdown: '3d left' },
  { id: 't-16', category: 'service',  title: 'Deep-clean a 2-bed apartment',        amountUsdc: 30, city: 'Accra',        flag: '🇬🇭', countdown: '1d left' },
  { id: 't-17', category: 'digital',  title: 'Set up a WhatsApp Business catalog',  amountUsdc: 16, city: 'Remote',       flag: '🌍', countdown: '2d left' },
  { id: 't-18', category: 'errand',   title: 'Wait in line for concert tickets',    amountUsdc: 14, city: 'Johannesburg', flag: '🇿🇦', countdown: '90m left' },
  { id: 't-19', category: 'delivery', title: 'Same-day pharmacy pickup + dropoff',  amountUsdc: 6,  city: 'Manila',       flag: '🇵🇭', countdown: '1h left' },
  { id: 't-20', category: 'digital',  title: 'Subtitle a 5-minute YouTube video',   amountUsdc: 13, city: 'Remote',       flag: '🌍', countdown: '18h left' },
  { id: 't-21', category: 'service',  title: 'Install two ceiling fans',            amountUsdc: 24, city: 'Lagos',        flag: '🇳🇬', countdown: '7h left' },
  { id: 't-22', category: 'photo',    title: 'Passport photos at your door',        amountUsdc: 5,  city: 'Nairobi',      flag: '🇰🇪', countdown: '2h left' },
  { id: 't-23', category: 'errand',   title: 'Return a parcel to the courier hub',  amountUsdc: 6,  city: 'Cape Town',    flag: '🇿🇦', countdown: '4h left' },
  { id: 't-24', category: 'digital',  title: 'Fix a broken Shopify checkout',       amountUsdc: 50, city: 'Remote',       flag: '🌍', countdown: '1d left' },
] as const
