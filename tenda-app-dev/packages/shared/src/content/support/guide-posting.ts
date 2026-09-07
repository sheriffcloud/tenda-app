/**
 * Posting-a-gig guide (multichain rewrite 2026-08-16, extracted from the
 * mobile screen so web can't drift): payment is USDC on the network the
 * poster picks; the gas warning names no single chain.
 */
import type { GuideSection } from './types'

export const SUPPORT_GUIDE_POSTING: readonly GuideSection[] = [
  {
    title: 'How to create a gig',
    steps: [
      { title: 'Tap + Post a Gig', description: 'From the center tab or the Drawer.' },
      { title: 'Describe the job', description: 'Be specific, workers decide to accept based on what you write.' },
      {
        title: 'Set the payment',
        description:
          'Pick the network (Solana, Base or Celo) and enter the amount in USDC. The equivalent in your local currency is shown for reference.',
      },
      {
        title: 'Review your draft',
        description:
          'Your gig saves as a draft first, check title, description, location, and payment before publishing.',
      },
      {
        title: 'Publish + fund the escrow',
        description: "Tap Publish to lock payment on-chain. You'll approve the transaction in your wallet.",
        warning:
          "Your wallet needs the gig amount in USDC plus a tiny network fee (usually under a cent), paid in the network's native token.",
      },
      {
        title: 'Wait for a worker to accept',
        description: 'Your gig is now live. Workers in your area will see it in the feed.',
      },
    ],
  },
  {
    title: 'Tips for setting a fair price',
    steps: [
      { title: 'Research similar gigs', description: 'Browse the feed to see what others charge for similar work.' },
      {
        title: 'Account for time and skill',
        description: 'A 2-hour errand should pay more than a 30-minute task. Skilled work commands higher rates.',
      },
      {
        title: 'Be specific in your description',
        description: 'Clear gigs attract better workers and reduce disputes later.',
      },
    ],
  },
  {
    title: 'Approving completed work',
    steps: [
      {
        title: "You'll get a notification on submission",
        description: 'Open the gig to review the submitted proof.',
      },
      { title: 'Review carefully', description: 'Make sure the work matches what was agreed in the description.' },
      {
        title: 'Tap Approve',
        description: 'Your wallet signs the release transaction. Payment goes to the worker instantly.',
      },
    ],
  },
  {
    title: 'How to raise a dispute',
    steps: [
      { title: 'Tap Dispute on the gig screen', description: 'Available after the worker submits proof.' },
      { title: 'Describe the issue', description: 'Explain what was missing or done incorrectly.' },
      {
        title: 'Wait for resolution',
        description: 'Tenda reviews both sides and decides. Payment stays in escrow until then.',
        tip: 'A specific, detailed gig description makes disputes easier to resolve in your favour.',
      },
    ],
  },
]
