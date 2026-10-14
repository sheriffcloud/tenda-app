/**
 * Payments & escrow guide copy (multichain rewrite 2026-08-16): the gig
 * asset is USDC on EVERY supported chain (CHAIN_MANIFEST `gig` role), so
 * the money-flow copy says USDC — never a chain's native token.
 */
import type { EscrowFlowStep } from './types'

export const SUPPORT_ESCROW_INTRO = {
  label: 'What is escrow?',
  body: 'When you post a gig, your USDC is held safely on-chain. Workers can see the funds are locked before they accept. It’s released to them only when you approve the work.',
} as const

export const SUPPORT_ESCROW_FLOW: readonly EscrowFlowStep[] = [
  { num: 1, title: 'You fund the escrow', desc: 'USDC is locked on-chain when you publish your gig.' },
  { num: 2, title: 'Worker submits proof', desc: 'You review photos, files, or a delivery confirmation.' },
  { num: 3, title: 'You approve → they’re paid', desc: 'Funds release on-chain in seconds.' },
]

/** Small print under the fee calculator. */
export const SUPPORT_FEE_NOTE =
  'Rate subject to change. A tiny network fee (usually under a cent) also applies when funds move on-chain.'
