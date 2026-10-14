/**
 * Data the two GigWizard suites share. Data only: the `vi.mock` preambles stay
 * in each test file, which is how every other suite here does it — a factory
 * is hoisted per-file and does not travel with an import.
 */
import type { ChainRegistryEntry, GigFormValues } from '@tenda/shared'
import { registryEntryDefaults } from '@tenda/shared/testing'

// Typed against the WIRE type on purpose: these stand in for what
// GET /v1/platform/chains answers, and an untyped literal is how they served
// assets with no `roles` for a whole release after the field became required.
export const SOL_CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana',
  escrow_address: 'PROG',
  ...registryEntryDefaults('solana:devnet'),
  assets: [{ id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false, funds_by_signature: true, roles: ['gig', 'exchange'] }],
}

export const EVM_CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xE',
  ...registryEntryDefaults('eip155:84532'),
  assets: [{ id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true, funds_by_signature: true, roles: ['gig', 'exchange'] }],
}

/** A gig that satisfies every step, so a test can start from "valid". */
export const VALID: Partial<GigFormValues> = {
  title: 'Deliver a package',
  description: 'Collect and deliver safely.',
  category: 'delivery',
  remote: true,
  paymentRaw: '10000000',
}
