import { View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from './Text'
import { formatFiat } from '@/lib/currency'
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

function pickMonoTier(size: number) {
  if (size >= 28) return typography.styles.monoLarge
  if (size >= 18) return typography.styles.monoMid
  return typography.styles.mono
}

export function MoneyText({ fiat, currency, amountLabel, size = 20 }: MoneyTextProps) {
  const { theme } = useUnistyles()
  const tier = pickMonoTier(size)
  const subSize = Math.max(10.5, Math.round(size * 0.55))

  const headlineStyle = {
    fontFamily: tier.fontFamily,
    fontWeight: '700' as const,
    fontSize: size,
    lineHeight: Math.round(size * 1.1),
    letterSpacing: -size * 0.013,
  }

  const subStyle = {
    fontFamily: typography.fonts.mono,
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
