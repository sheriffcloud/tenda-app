/**
 * Support-centre content shapes — one vocabulary for every client's help
 * surface. Copy lives in the sibling files; clients own only rendering,
 * routes and icons.
 */

export interface SupportFaq {
  question: string
  answer: string
}

export interface GlossaryTerm {
  term: string
  definition: string
}

export interface EscrowFlowStep {
  num: number
  title: string
  desc: string
}

export interface SupportTopic {
  slug: 'escrow' | 'posting' | 'working' | 'wallet' | 'glossary' | 'faq'
  title: string
  description: string
}

/** One numbered step in a guide (the number is the array position + 1). */
export interface GuideStep {
  title: string
  description: string
  warning?: string
  tip?: string
}

/** A titled run of steps — clients render each as an accordion/card. */
export interface GuideSection {
  title: string
  steps: readonly GuideStep[]
}

/** One wallet card in the wallet-setup guide. */
export interface WalletGuideEntry {
  id: 'phantom' | 'solflare' | 'walletconnect'
  name: string
  /** Which side of the multichain split this wallet serves. */
  network: 'solana' | 'evm'
  badge: { label: string; tone: 'success' | 'warning' }
  /** Extra caution rendered above/beside the card when the transport needs it. */
  note?: string
  steps: readonly GuideStep[]
}

/** A troubleshooting question/answer pair. */
export interface SupportQA {
  question: string
  answer: string
}
