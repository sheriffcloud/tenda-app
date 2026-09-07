/**
 * Working-on-a-gig guide (multichain rewrite 2026-08-16, extracted from
 * the mobile screen): payouts arrive as USDC on the gig's network.
 */
import type { GuideSection } from './types'

export const SUPPORT_GUIDE_WORKING: readonly GuideSection[] = [
  {
    title: 'How to find gigs',
    steps: [
      { title: 'Open the Home tab', description: 'The feed shows open gigs near you.' },
      {
        title: 'Use filters',
        description: 'Narrow by category, city, or keyword to find gigs that match your skills.',
      },
      {
        title: 'Tap a gig to see details',
        description:
          "Review title, description, payment, duration, and the poster's profile before accepting.",
      },
    ],
  },
  {
    title: 'How to accept a gig',
    steps: [
      { title: 'Open the gig and tap Accept', description: 'Only open gigs with no worker yet can be accepted.' },
      {
        title: 'Approve the transaction',
        description: 'Your wallet opens and asks you to sign, this records your acceptance on-chain.',
        tip: "Payment is already in escrow. You're not paying anything to accept.",
      },
      {
        title: 'Get to work',
        description: 'Start as agreed. Message the poster from the gig screen if you have questions.',
      },
    ],
  },
  {
    title: 'How to submit proof of work',
    steps: [
      {
        title: 'Complete the work first',
        description: 'Make sure everything matches the gig description before submitting.',
      },
      {
        title: 'Tap Submit Proof',
        description: 'Upload photos, a link, or a short description of what you delivered.',
      },
      {
        title: 'Sign the submission',
        description: 'Your wallet asks you to approve, this records the submission on-chain.',
      },
      { title: 'Wait for the client', description: 'The poster reviews and approves, or raises a dispute.' },
    ],
  },
  {
    title: 'How and when you get paid',
    steps: [
      {
        title: 'The client taps Approve',
        description: 'Once approved, the on-chain transaction is signed immediately.',
      },
      {
        title: 'Payment arrives in your wallet',
        description: 'USDC lands directly in your wallet address on the gig’s network. No waiting, no withdrawal.',
        tip: "Convert USDC to your local currency through Tenda's P2P exchange.",
      },
    ],
  },
]
