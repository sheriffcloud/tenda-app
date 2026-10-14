/**
 * The pre-account surfaces' strings: the welcome hero and the three-slide
 * value-prop carousel (Auth comp, lines 409-452).
 *
 * The comp's wording is used because these screens have no shared counterpart:
 * mobile's welcome says "Work. Earn. Instantly." over four slides written for
 * a phone-first flow with a "no crypto experience needed" beat that the web
 * app does not make. Two flows, two audiences, and no cross-client vocabulary
 * to fork — the same reasoning as `AUTH_COPY`.
 */
import { Landmark, ShieldCheck, Receipt, type LucideIcon } from 'lucide-react'

export const WELCOME_COPY = {
  title: 'Get paid for the work, not for the chasing.',
  lede: 'Every gig is funded into escrow before anyone starts, wherever the work happens.',
  primary: 'Get started',
  secondary: 'I already have an account',
  /**
   * Mobile's welcome offers "Learn more" into the same carousel. The comp
   * draws no route into it at all, which would leave /onboarding reachable
   * only by typing the URL.
   */
  learn: 'How Tenda works',
  browse: {
    before: 'You can ',
    link: 'browse gigs without an account',
    after: '. Signing in is only needed to apply, accept or get paid.',
  },
} as const

export interface OnboardingSlide {
  /**
   * The comp puts a captioned placeholder here ("illustration — escrow lock")
   * for artwork that does not exist. An icon says the same thing without
   * shipping a note-to-self, and it is what mobile's carousel does.
   */
  icon: LucideIcon
  title: string
  body: string
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    icon: ShieldCheck,
    title: 'The money is locked before you start',
    body: 'Posters fund the gig into escrow first. When you see an amount on Tenda, it already exists — it is not a promise to pay you later.',
  },
  {
    icon: Receipt,
    title: 'Proof releases the payment',
    body: 'Do the work, submit the proof the gig asked for, and escrow pays out. If the poster goes quiet, the approval deadline releases it anyway.',
  },
  {
    icon: Landmark,
    title: 'Paid out where you actually bank',
    body: 'Convert supported assets to local currency using the payout methods available in your country.',
  },
]

export const ONBOARDING_COPY = {
  title: 'How Tenda works',
  skip: 'Skip',
  next: 'Next',
  /** The last slide's control leaves the carousel rather than repeating it. */
  done: 'Get started',
  counter: (index: number, total: number) => `${index + 1} of ${total}`,
  /** Each dot names the slide it goes to, so it is not "button, button, button". */
  dot: (index: number, title: string) => `Slide ${index + 1}: ${title}`,
} as const
