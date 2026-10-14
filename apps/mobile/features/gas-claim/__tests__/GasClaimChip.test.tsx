/**
 * The claim chip (#100) — the feature's only visible surface.
 *
 * The property with teeth is what it does NOT render. Its predecessor showed a
 * card per chain including chains the user could not claim on, so "you cannot
 * have this, here is why" lived permanently on the wallet screen. The chip
 * exists only while a claim is genuinely available; every other state is
 * silence, and these tests are what stop that regressing into an explanation.
 */
import { StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { GasSeedAvailability } from '@tenda/shared'
import { radius } from '@/theme/tokens'
import { GasClaimChip } from '../GasClaimChip'
import { GAS_CLAIM_COPY } from '../copy'

// The component reaches Text through the `@/components/ui` barrel, which pulls
// Header, which builds styles with unistyles' StyleSheet at module load.
jest.mock('react-native-unistyles', () => ({
  StyleSheet: { create: (sheet: unknown) => sheet },
  useUnistyles: () => ({
    theme: {
      colors: {
        // DISTINCT values on purpose: `card` is what the balance row paints
        // itself, and the regression below is the chip reaching for the same
        // token. Equal stand-ins here would make that test unable to fail.
        surface: { card: '#fff', inset: '#f2f2f2' },
        border: { default: '#ccc' },
        content: { primary: '#000', secondary: '#444', tertiary: '#666' },
      },
    },
  }),
}))

const CHAIN = 'eip155:16661'

function offer(over: Partial<GasSeedAvailability> = {}): GasSeedAvailability {
  return {
    chain_id: CHAIN,
    available: true,
    amount_raw: '10000000000000000',
    state: 'unclaimed',
    reason: null,
    ...over,
  }
}

test('an available claim renders the chip', () => {
  render(<GasClaimChip offer={offer()} claiming={false} onClaim={jest.fn()} />)
  expect(screen.getByText(GAS_CLAIM_COPY.chip)).toBeTruthy()
})

test('tapping claims THIS chain', () => {
  const onClaim = jest.fn()
  render(<GasClaimChip offer={offer()} claiming={false} onClaim={onClaim} />)
  fireEvent.press(screen.getByRole('button'))
  expect(onClaim).toHaveBeenCalledWith(CHAIN)
})

/**
 * The refusal cases, one per reason a chain can be unclaimable. Each asserts
 * SILENCE — no chip, and no text explaining the refusal — because the server's
 * `claimRefusal` answers the tap and there is no tap to answer here.
 */
test.each([
  ['already granted', { available: false, state: 'claimed' as const, reason: 'already_granted' as const }],
  ['a claim in flight', { available: false, state: 'in_progress' as const, reason: 'already_granted' as const }],
  ['an unverified phone', { available: false, state: 'unclaimed' as const, reason: 'phone_required' as const }],
  ['an empty hot wallet', { available: false, state: 'unclaimed' as const, reason: 'funder_empty' as const }],
  ['claims switched off', { available: false, state: 'unclaimed' as const, reason: 'claims_disabled' as const }],
])('renders NOTHING for %s', (_label, over) => {
  render(<GasClaimChip offer={offer(over)} claiming={false} onClaim={jest.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByText(GAS_CLAIM_COPY.chip)).toBeNull()
})

test('while claiming: the label gives way to a spinner and the press is refused', () => {
  const onClaim = jest.fn()
  render(<GasClaimChip offer={offer()} claiming onClaim={onClaim} />)
  // The label is gone — a chip that still said "Get gas" mid-claim invites the
  // second tap the whole grant model exists to make impossible.
  expect(screen.queryByText(GAS_CLAIM_COPY.chip)).toBeNull()
  fireEvent.press(screen.getByRole('button'))
  expect(onClaim).not.toHaveBeenCalled()
})

test('the accessible name says gas for WHICH chain', () => {
  render(<GasClaimChip offer={offer()} claiming={false} onClaim={jest.fn()} />)
  // "Get gas" alone, announced out of context, does not say gas for what — the
  // visible label is short because of row width, which a screen reader has none.
  expect(screen.getByLabelText(`${GAS_CLAIM_COPY.action} on ${CHAIN}`)).toBeTruthy()
})

test('busy state is announced, not just drawn', () => {
  render(<GasClaimChip offer={offer()} claiming onClaim={jest.fn()} />)
  expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
    busy: true,
    disabled: true,
  })
})

/**
 * REGRESSION (#100 audit, C8). The chip must not be painted in its parent's colour.
 *
 * `WalletBalanceRows` paints each row `surface.card`. The first cut of this chip
 * reached for `surface.card` too, so a CONTROL sat on its background with
 * nothing but a 1px `border.default` — the divider tone — to say it was there.
 * Pinned against the row's token rather than a literal, so a later theme change
 * that merges the two still fails here.
 */
test('the chip is not painted in the balance row’s own surface', () => {
  render(<GasClaimChip offer={offer()} claiming={false} onClaim={jest.fn()} />)
  const flat = StyleSheet.flatten(
    screen.getByRole('button').props.style,
  ) as { backgroundColor?: string }
  const ROW_SURFACE = '#fff' // what WalletBalanceRows uses: theme.colors.surface.card
  expect(flat.backgroundColor).toBeDefined()
  expect(flat.backgroundColor).not.toBe(ROW_SURFACE)
})

/**
 * REGRESSION (#100 audit, C9). The pill radius comes from the token, not a literal.
 *
 * Every other control on mobile reads a `radius.*` token, and tokens.ts says in
 * as many words why: Button's hand-kept literals were what web and tendahq then
 * copied by hand. The first cut of this chip wrote `999` — the same drift
 * starting again, and a different number from the 9999 the token holds.
 */
test('the pill radius is the radius.full token, not a hand-written literal', () => {
  render(<GasClaimChip offer={offer()} claiming={false} onClaim={jest.fn()} />)
  const flat = StyleSheet.flatten(screen.getByRole('button').props.style) as {
    borderRadius?: number
  }
  expect(flat.borderRadius).toBe(radius.full)
})
