/**
 * The chip-row pickers: NetworkPicker's collapse + link-a-wallet gating,
 * the deadline options, acceptance-mode radios, and proof normalisation
 * through the REAL shared helper.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  FILE_PROOF_TYPES,
  PROOF_TYPES,
  PROOF_TYPE_LABEL,
  type ChainOptionState,
  type GigChainOption as ChainOption,
  type ProofType,
} from '@tenda/shared'
import { AcceptDeadlinePicker } from '@/components/gig/gig-form/AcceptDeadlinePicker'
import { AcceptanceModePicker } from '@/components/gig/gig-form/AcceptanceModePicker'
import { NetworkPicker } from '@/components/gig/gig-form/NetworkPicker'
import { ProofRequirementPicker } from '@/components/gig/gig-form/ProofRequirementPicker'

/**
 * Mirrors the shared factory's one invariant — `enabled` is DERIVED from the
 * state, never chosen — so no fixture here can describe an option
 * gigChainOptions could not produce (e.g. enabled while needing a wallet).
 */
function option(id: string, label: string, state: ChainOptionState): ChainOption {
  return { id, label, state, enabled: state === 'ready' }
}

const OPTIONS = [
  option('solana:devnet', 'Solana', 'ready'),
  option('eip155:84532', 'Base Sepolia', 'needs_wallet'),
]

test('NetworkPicker renders nothing with a single eligible chain (no choice to make)', () => {
  const { container } = render(
    <NetworkPicker options={[OPTIONS[0]]} selected="solana:devnet" onSelect={vi.fn()} assetSymbol="USDC" />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('an EVM chain without a linked wallet is visible but disabled with the link hint', () => {
  const onSelect = vi.fn()
  render(<NetworkPicker options={OPTIONS} selected="solana:devnet" onSelect={onSelect} assetSymbol="USDC" />)
  const disabled = screen.getByRole('button', { name: 'Base Sepolia (link a wallet)' })
  expect(disabled).toBeDisabled()
  fireEvent.click(disabled)
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Solana' }))
  expect(onSelect).toHaveBeenCalledWith('solana:devnet')
})

test('a disabled chain says WHY, and only a real absence says "link a wallet"', () => {
  // Three causes disable a chip. Saying "link a wallet" while the trust list
  // is still loading, or after it failed, is the dead end ApplyWalletPicker
  // was built to remove — so each state gets its own note.
  const cases: [ChainOptionState, string][] = [
    ['needs_wallet', 'Base Sepolia (link a wallet)'],
    ['wallets_loading', 'Base Sepolia (checking wallets)'],
    ['wallets_unavailable', 'Base Sepolia (wallets unavailable)'],
  ]
  for (const [state, name] of cases) {
    const { unmount } = render(
      <NetworkPicker
        options={[OPTIONS[0], option('eip155:84532', 'Base Sepolia', state)]}
        selected="solana:devnet"
        onSelect={vi.fn()}
        assetSymbol="USDC"
      />,
    )
    expect(screen.getByRole('button', { name })).toBeDisabled()
    unmount()
  }
})

test('a ready chain carries no parenthetical at all', () => {
  render(<NetworkPicker options={OPTIONS} selected="solana:devnet" onSelect={vi.fn()} assetSymbol="USDC" />)
  expect(screen.getByRole('button', { name: 'Solana' })).toBeEnabled()
})

test('AcceptDeadlinePicker offers the shared options and reports hours', () => {
  const onChange = vi.fn()
  render(<AcceptDeadlinePicker value={168} onChange={onChange} />)
  expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: '48h' }))
  expect(onChange).toHaveBeenCalledWith(48)
})

test('AcceptanceModePicker states both consequences and reports the mode', () => {
  const onChange = vi.fn()
  render(<AcceptanceModePicker requiresApproval={false} onChange={onChange} />)
  expect(screen.getByRole('radio', { name: /First come/ })).toHaveAttribute('aria-checked', 'true')
  // The pricier option names its cost so it is not chosen by accident.
  const approval = screen.getByRole('radio', { name: /I approve the worker/ })
  expect(approval.textContent).toMatch(/extra transaction/)
  fireEvent.click(approval)
  expect(onChange).toHaveBeenCalledWith(true)
})

test('ProofRequirementPicker offers the FULL vocabulary, data types included', () => {
  // #15 gave the data types their params + capture UI, so requiring one no
  // longer strands the worker — every type is on offer, enabled.
  render(<ProofRequirementPicker value={[]} onChange={vi.fn()} />)
  for (const type of PROOF_TYPES) {
    expect(screen.getByRole('button', { name: PROOF_TYPE_LABEL[type] })).toBeEnabled()
  }
})

test('a REMOTE gig disables geotag — unless already selected, so it can still be unpicked', () => {
  // A remote gig has nowhere to check in; the server refuses the pair. But a
  // disabled chip cannot be DESELECTED either, so an already-selected geotag
  // stays pressable as the way out of the refused combination.
  const onChange = vi.fn()
  const { rerender } = render(<ProofRequirementPicker value={[]} onChange={onChange} remote />)
  expect(screen.getByRole('button', { name: PROOF_TYPE_LABEL.geotag })).toBeDisabled()
  for (const type of FILE_PROOF_TYPES) {
    expect(screen.getByRole('button', { name: PROOF_TYPE_LABEL[type] })).toBeEnabled()
  }
  rerender(
    <ProofRequirementPicker value={['geotag'] as ProofType[]} onChange={onChange} remote />,
  )
  const geotag = screen.getByRole('button', { name: PROOF_TYPE_LABEL.geotag })
  expect(geotag).toBeEnabled()
  fireEvent.click(geotag)
  expect(onChange).toHaveBeenCalledWith([])
})

test('ProofRequirementPicker toggles through the REAL normaliser (order is canonical)', () => {
  const onChange = vi.fn()
  const { rerender } = render(<ProofRequirementPicker value={[]} onChange={vi.fn()} />)
  rerender(<ProofRequirementPicker value={['video'] as ProofType[]} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
  // video-then-photo normalises to the server's order, not click order.
  expect(onChange).toHaveBeenCalledWith(['image', 'video'])
  fireEvent.click(screen.getByRole('button', { name: 'Video' }))
  expect(onChange).toHaveBeenLastCalledWith([])
})
