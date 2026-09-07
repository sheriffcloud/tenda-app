/**
 * Data the two GigWizard suites share. Data only: the `vi.mock` preambles stay
 * in each test file, which is how every other suite here does it — a factory
 * is hoisted per-file and does not travel with an import.
 */
import type { GigFormValues } from '@tenda/shared'

export const SOL_CHAIN = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana',
  escrow_address: 'PROG',
  assets: [{ id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false }],
}

export const EVM_CHAIN = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xE',
  assets: [{ id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true }],
}

/** A gig that satisfies every step, so a test can start from "valid". */
export const VALID: Partial<GigFormValues> = {
  title: 'Deliver a package',
  description: 'Collect and deliver safely.',
  category: 'delivery',
  remote: true,
  paymentRaw: '10000000',
}
