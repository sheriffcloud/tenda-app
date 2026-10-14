import { View, StyleSheet } from 'react-native'
import type { ReactNode } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { formatAssetAmount, truncateWallet } from '@tenda/shared'
import type { WalletChainBalance } from '@tenda/shared'

/** What a figure reads when the chain could not be read at all — web's grid uses the same glyph. */
const NO_READING = '—'

export interface WalletBalanceRowsProps {
  balances: WalletChainBalance[]
  /**
   * An optional affordance for one chain, rendered beside its native figure.
   *
   * DELIBERATELY GENERIC — it names no feature. The gas claim is the first thing
   * to use it (`useGasClaimChip`), and this file must not learn that: a balance
   * row's job is to show balances, and a screen that hard-codes one subsidy is a
   * screen that has to be edited when the subsidy is turned off. Return null for
   * a chain with nothing to offer, which is the ordinary case.
   *
   * It sits on the NATIVE line on purpose. That line is where a chain already
   * admits it has no gas, so an offer to fix that belongs next to it rather than
   * in a block of its own — and the row's height does not change.
   */
  renderChainAction?: (chain_id: string) => ReactNode
}

/**
 * Per-(wallet, chain) balance breakdown beneath the USDC hero. Each row: chain
 * name + truncated address, with USDC as the headline figure and the native gas
 * token as a secondary hint (e.g. "45.00 USDC · 0.01 ETH"), then any other
 * asset the wallet holds on that chain (cUSD, cNGN) as further small lines.
 */
export function WalletBalanceRows({ balances, renderChainAction }: WalletBalanceRowsProps) {
  const { theme } = useUnistyles()
  if (balances.length === 0) return null

  return (
    <View style={s.wrap}>
      {balances.map((b) => {
        // A dash, not '0 USDC'. No reading and a zero balance are opposite
        // facts, and the second dressed as the first is the same conflation
        // fixed once at the section level (resolveWalletSection) and again in
        // the EVM reader that used to manufacture the zero (#64). Web's grid
        // never had it — `usdc?.value ?? '—'` — which is why the glyph is
        // borrowed from there. `native` below already withholds rather than
        // inventing.
        const usdc = b.usdc ? formatAssetAmount(b.usdc.amountRaw, b.usdc.assetId) : NO_READING
        const native = b.native ? formatAssetAmount(b.native.amountRaw, b.native.assetId) : null
        // Every other asset the read returned (cUSD, cNGN, …) that the wallet
        // actually HOLDS. A zero is not listed: a row per empty asset would
        // bury the one figure a holder came to see.
        const others = b.others
          .filter((o) => BigInt(o.amountRaw) > 0n)
          .map((o) => ({ id: o.assetId, text: formatAssetAmount(o.amountRaw, o.assetId) }))
        return (
          <View
            key={`${b.chainId}:${b.address}`}
            style={[s.row, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}
          >
            <View style={s.left}>
              <Text style={[s.chain, { color: theme.colors.content.primary }]} numberOfLines={1}>
                {b.displayName}
              </Text>
              <Text style={[s.addr, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
                {truncateWallet(b.address)}
              </Text>
            </View>
            <View style={s.right}>
              <Text style={[s.usdc, { color: theme.colors.content.primary }]} numberOfLines={1}>
                {usdc}
              </Text>
              {/* The native figure and its action share one line. The action
                  renders even when `native` is null: no reading and no gas are
                  different facts, and a chain the server says is claimable is
                  claimable either way. */}
              <View style={s.nativeLine} testID="native-line">
                {native !== null && (
                  <Text
                    style={[s.native, { color: theme.colors.content.tertiary }]}
                    numberOfLines={1}
                  >
                    {native}
                  </Text>
                )}
                {renderChainAction?.(b.chainId)}
              </View>
              {others.map((o) => (
                <Text
                  key={o.id}
                  testID={`other-asset-${o.id}`}
                  style={[s.native, { color: theme.colors.content.tertiary }]}
                  numberOfLines={1}
                >
                  {o.text}
                </Text>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  left: { flexShrink: 1, minWidth: 0 },
  chain: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  addr: { fontFamily: typography.fonts.mono.regular, fontSize: 11, lineHeight: 15, marginTop: 1 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  // CONTENT-SIZED, and deliberately not `minHeight: 20`. The first cut set that
  // so a row with a chip and a row without would match — they did, at 20pt each,
  // when the native text's own line box is 16 (lineHeight 15 + marginTop 1). It
  // bought consistency by making EVERY row 4pt taller, on the screen whose
  // heaviness is the reason #100 exists. A row that gains a chip may be a little
  // taller than one that does not; the row with nothing on offer pays nothing.
  nativeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usdc: { fontFamily: typography.fonts.mono.semibold, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  native: { fontFamily: typography.fonts.mono.regular, fontSize: 11, lineHeight: 15, marginTop: 1 },
})
