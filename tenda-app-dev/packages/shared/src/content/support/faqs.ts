/**
 * FAQ copy (multichain rewrite 2026-08-16): Tenda settles gigs in USDC on
 * the chain the poster picks — Solana, Base or Celo — so the answers name
 * USDC and networks, never a single chain. ONE wording, every surface.
 */
import type { SupportFaq } from './types'

export const SUPPORT_FAQS: readonly SupportFaq[] = [
  {
    question: 'Do I need crypto to use Tenda?',
    answer:
      "No, you can receive payouts directly to your bank. The wallet holds what you've earned; you cash out in your local currency through Trade.",
  },
  {
    question: 'Will my money be safe?',
    answer:
      "Yes. Payment is locked in a smart contract on the blockchain your gig runs on — Solana, Base or Celo — not held by Tenda. We can't touch your money. It's released only when you (the poster) approve the work, or returned to you if the gig expires or a dispute is resolved in your favour.",
  },
  {
    question: 'What if the client never approves?',
    answer:
      "If a poster doesn't approve or raise a dispute within the gig's time limit, the gig expires and you can raise a dispute through the app. For ongoing issues, contact our support team.",
  },
  {
    question: 'Can I lose my money as a poster?',
    answer:
      "Only if you approve work you're not satisfied with. If the work isn't done correctly, raise a dispute before approving. Never tap Approve unless you're satisfied; it cannot be undone.",
  },
  {
    question: 'How do I withdraw to my bank account?',
    answer:
      'Gig earnings arrive as USDC in your wallet. Sell it through Tenda P2P (the Trade tab): a buyer pays your bank or mobile-money account in your local currency, and the USDC is released to them from escrow once you confirm the payment.',
  },
  {
    question: 'What is USDC?',
    answer:
      "USDC is a stablecoin — a digital dollar designed so 1 USDC stays worth 1 US dollar. Gig payments on Tenda are made in USDC on the network the gig runs on, and the app shows the local-currency equivalent alongside so you always know what you're paying or earning.",
  },
  {
    question: 'Which networks does Tenda support?',
    answer:
      'Solana, Base and Celo. A gig is pinned to one network when it is published; the escrow, the payout and the tiny network fee (usually under a cent) all live on that network. You only need a wallet for the networks you use.',
  },
  {
    question: 'Can I both post gigs and work on gigs?',
    answer:
      'Yes, there are no restrictions. You can post a gig as a client and also apply to work on other gigs as a worker. Use both sides of the marketplace.',
  },
]
