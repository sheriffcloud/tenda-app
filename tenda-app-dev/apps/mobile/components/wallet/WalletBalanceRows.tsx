import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { formatAssetAmount, truncateWallet } from '@tenda/shared'
import type { WalletChainBalance } from '@tenda/shared'

/** What a figure reads when the chain could not be read at all — web's grid uses the same glyph. */
const NO_READING = '—'

/**
 * Per-(wallet, chain) balance breakdown beneath the USDC hero. Each row: chain
 * name + truncated address, with USDC as the headline figure and the native gas
 * token as a secondary hint (e.g. "45.00 USDC · 0.01 ETH").
 */
export function WalletBalanceRows({ balances }: { balances: WalletChainBalance[] }) {
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
              {native !== null && (
                <Text style={[s.native, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
                  {native}
                </Text>
              )}
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
  usdc: { fontFamily: typography.fonts.mono.semibold, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  native: { fontFamily: typography.fonts.mono.regular, fontSize: 11, lineHeight: 15, marginTop: 1 },
})
