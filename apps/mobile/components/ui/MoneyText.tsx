import { View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from './Text'
import { formatFiat } from '@tenda/shared'
import type { SupportedCurrency } from '@tenda/shared'

interface MoneyTextProps {
  /** Fiat value in the given currency, null hides the fiat headline ('—'). */
  fiat: number | null
  currency: SupportedCurrency
  /** Pre-formatted asset amount, e.g. "0.05 SOL" / "5 USDC". */
  amountLabel: string
  /** Headline font size; auto-picks mono tier */
  size?: number
}

export function MoneyText({ fiat, currency, amountLabel, size = 20 }: MoneyTextProps) {
  const { theme } = useUnistyles()
  const subSize = Math.max(10.5, Math.round(size * 0.55))

  const headlineStyle = {
    // The BOLD face, named explicitly, because mono is registered per weight
    // and RN does not synthesise one for a custom family on Android — a
    // `fontWeight` beside a 500/600 file is simply ignored there.
    //
    // This used to read `pickMonoTier(size).fontFamily`, and every tier
    // (`styles.mono`/`monoMid`/`monoLarge`) resolves to the medium or semibold
    // face — never bold — so the headline named a 500/600 file while asking
    // for 700. The tier bought nothing else either: every other property below
    // is computed from `size`. It was invisible while the family name resolved
    // to nothing and the platform sans answered the weight.
    fontFamily: typography.fonts.mono.bold,
    fontWeight: '700' as const,
    fontSize: size,
    lineHeight: Math.round(size * 1.1),
    letterSpacing: -size * 0.013,
  }

  const subStyle = {
    fontFamily: typography.fonts.mono.medium,
    fontWeight: '500' as const,
    fontSize: subSize,
    lineHeight: Math.round(subSize * 1.3),
    letterSpacing: subSize * 0.01,
  }

  return (
    <View style={{ flexDirection: 'column' }}>
      <Text
        style={headlineStyle}
        color={theme.colors.content.primary}
      >
        {fiat !== null ? formatFiat(fiat, currency) : '—'}
      </Text>
      <Text
        style={subStyle}
        color={theme.colors.content.tertiary}
      >
        {amountLabel}
      </Text>
    </View>
  )
}
