/**
 * chainLabel — resolves a CAIP-2 chain id to its human name straight from the
 * shared CHAIN_MANIFEST, so a newly-added chain needs no display-code edit.
 * These assert against the real manifest (no mocks) to catch drift between the
 * label surface and the registry.
 */
import { chainLabel } from '@/lib/chains'
import { CHAIN_MANIFEST } from '@tenda/shared'

test('names a mainnet chain from the manifest', () => {
  expect(chainLabel('solana:mainnet')).toBe('Solana')
  expect(chainLabel('eip155:8453')).toBe('BASE')
})

test('distinguishes testnets by their own display name (not collapsed to the family)', () => {
  // The old hardcoded map returned 'Solana'/'BASE' for these; the manifest
  // names them distinctly so a worker can tell a rehearsal chain from mainnet.
  expect(chainLabel('solana:devnet')).toBe('Solana Devnet')
  expect(chainLabel('eip155:84532')).toBe('Base Sepolia')
})

test('every manifest entry resolves to its own displayName', () => {
  for (const entry of CHAIN_MANIFEST) {
    expect(chainLabel(entry.id)).toBe(entry.displayName)
  }
})

test('falls back to "Unknown" for an id not in the manifest', () => {
  expect(chainLabel('eip155:999999')).toBe('Unknown')
  expect(chainLabel('bogus')).toBe('Unknown')
  expect(chainLabel('')).toBe('Unknown')
})
