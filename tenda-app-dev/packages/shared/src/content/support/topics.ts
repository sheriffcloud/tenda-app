/**
 * Support-centre topic cards. Slugs are the cross-client contract — each
 * client maps slug → its own route and icon ("vocabulary shared, routing
 * table per client").
 */
import type { SupportTopic } from './types'

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  { slug: 'escrow', title: 'Payments & Escrow', description: 'How we hold funds and pay workers.' },
  { slug: 'posting', title: 'Posting a Gig', description: 'Create a task, review work, handle disputes.' },
  { slug: 'working', title: 'Working on a Gig', description: 'Accept, submit proofs, get paid out.' },
  { slug: 'wallet', title: 'Wallet Setup', description: 'Connect a Solana or EVM wallet.' },
  { slug: 'glossary', title: 'Glossary', description: 'Plain-English definitions.' },
  { slug: 'faq', title: 'FAQ & Support', description: 'Answers and contact channels.' },
]
