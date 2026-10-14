/**
 * The gas claim, as a chip on the balance row of the chain that has no gas.
 *
 * WHY THIS SHAPE (user, 2026-09-05, replacing the card stack). The offer's
 * trigger is a ZERO BALANCE, not a marketing moment. `WalletBalanceRows` already
 * prints each chain's native figure, so the row that says "0.0000 0G" is exactly
 * where "get some" belongs — it costs no vertical space, it needs no heading,
 * and a user who holds gas on every chain never sees it at all. That last part
 * is the point: the previous surface rendered a card per chain on the app's
 * most-visited screen, including cards that only explained why a claim was NOT
 * possible, which is a permanent apology in the middle of someone's balances.
 *
 * ONLY `available` RENDERS. A refusal is not a thing to display standing on a
 * screen; it is an answer to a tap, and `claimRefusal` on the server already
 * writes one per reason ("verify your phone number before claiming the gas
 * seed"). The host hook toasts it. `in_progress` and `claimed` render nothing
 * either — re-offering a grant the user already holds is the mistake this whole
 * feature is shaped around, and silence is the correct way to not re-offer it.
 *
 * SMALL, AND STILL TAPPABLE. The pill is ~20pt tall so it sits inside an 11pt
 * text line without changing the row's height; `hitSlop` restores a comfortable
 * touch target without any of it being visible. Shrinking the box and shrinking
 * the target are different things, and only the first one was wanted.
 */

import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { GasSeedAvailability } from '@tenda/shared'
import { radius } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { GAS_CLAIM_COPY } from './copy'

export interface GasClaimChipProps {
  /** One chain's availability, from `useGasClaim`. Rendered ONLY when available. */
  offer: GasSeedAvailability
  /** True while THIS chain's claim is in flight. */
  claiming: boolean
  onClaim: (chain_id: string) => void
}

/**
 * The chip, or nothing.
 *
 * The `available` guard lives HERE as well as in the hook that builds it, and
 * the duplication is deliberate: this component is exported, so a future host
 * could render it directly, and a claim button that appears for a refused chain
 * is the one failure this surface must not have. One of the two guards is
 * redundant on every current path — that is what makes it a guard.
 */
export function GasClaimChip({ offer, claiming, onClaim }: GasClaimChipProps) {
  const { theme } = useUnistyles()
  if (!offer.available) return null

  return (
    <Pressable
      onPress={() => onClaim(offer.chain_id)}
      disabled={claiming}
      accessibilityRole="button"
      accessibilityState={{ disabled: claiming, busy: claiming }}
      accessibilityLabel={`${GAS_CLAIM_COPY.action} on ${offer.chain_id}`}
      // The visual is 20pt; this brings the touch target back to ~36pt without
      // the pill growing. A row of balances is a dense surface and a mis-tap
      // here costs a user their one grant on that chain.
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        s.chip,
        {
          borderColor: theme.colors.border.default,
          // `surface.inset`, NOT `surface.card`: the balance row this sits on is
          // itself `surface.card` (WalletBalanceRows), so the first cut painted
          // the chip in exactly its parent's colour and left a 1px divider-toned
          // border as the only thing separating a CONTROL from its background.
          backgroundColor: theme.colors.surface.inset,
          opacity: pressed || claiming ? 0.6 : 1,
        },
      ]}
    >
      {claiming ? (
        // The pill's `minWidth` keeps this from collapsing to the spinner's own
        // width mid-claim. It is a FLOOR, not a measured match to the label —
        // saying otherwise would be a number nobody checked.
        <ActivityIndicator size="small" color={theme.colors.content.secondary} />
      ) : (
        <Text size={10.5} weight="semibold" color={theme.colors.content.secondary}>
          {GAS_CLAIM_COPY.chip}
        </Text>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  chip: {
    // Literal, like Button's own HEIGHTS — control heights are not tokenised
    // yet (#64 tracks that). Tokenising this one alone would invert the drift.
    height: 20,
    minWidth: 54,
    paddingHorizontal: 8,
    // `radius.full`, not a literal. Every other control on mobile reads a radius
    // token, and the token block says why in as many words: Button's hand-kept
    // literals were the thing web and tendahq then copied by hand. A pill here
    // written as `999` would be the same drift starting again — and a different
    // number from the 9999 the token holds, for no reason.
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
