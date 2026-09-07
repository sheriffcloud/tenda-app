/**
 * The chain filter's mobile-pinned semantics: registry-driven options,
 * hidden on a single-chain deployment UNLESS a filter is active (the
 * clear affordance must survive a chain being disabled server-side),
 * "All chains" is the only reset, and re-clicking the active chip is a
 * no-op — never a silent jump back to all chains.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'
import { ChainFilterChips } from '@/components/shared/ChainFilterChips'
import { useChainRegistryStore } from '@/stores/chain-registry.store'

const chainOf = (id: string, display_name: string): ChainRegistryEntry => ({
  id,
  namespace: id.startsWith('solana') ? 'solana' : 'eip155',
  display_name,
  escrow_address: 'x',
  assets: [],
})

const TWO_CHAINS = [chainOf('solana:devnet', 'Solana Devnet'), chainOf('eip155:84532', 'Base Sepolia')]

beforeEach(() => {
  useChainRegistryStore.setState({ chains: TWO_CHAINS, status: 'ready' })
})

test('renders All chains + one chip per registry chain; selecting emits the CAIP-2 id', async () => {
  const onChange = vi.fn()
  render(<ChainFilterChips value={null} onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'All chains' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Base Sepolia' }))
  expect(onChange).toHaveBeenCalledWith('eip155:84532')
})

test('re-clicking the ACTIVE chip re-emits the same id (no toggle-to-clear); All chains clears', async () => {
  const onChange = vi.fn()
  render(<ChainFilterChips value="solana:devnet" onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'Solana Devnet' }))
  expect(onChange).toHaveBeenCalledWith('solana:devnet') // never null
  await userEvent.click(screen.getByRole('button', { name: 'All chains' }))
  expect(onChange).toHaveBeenCalledWith(null)
})

test('hidden on a single-chain deployment — unless a filter is ACTIVE (clear must stay reachable)', () => {
  useChainRegistryStore.setState({ chains: [TWO_CHAINS[0]], status: 'ready' })
  const { container } = render(<ChainFilterChips value={null} onChange={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()

  render(<ChainFilterChips value="eip155:84532" onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'All chains' })).toBeInTheDocument()
})

test('renders nothing while the registry has not loaded', () => {
  useChainRegistryStore.setState({ chains: null, status: 'loading' })
  const { container } = render(<ChainFilterChips value={null} onChange={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})
