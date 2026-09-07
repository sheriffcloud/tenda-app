import { useState } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import { Text } from '@/components/ui/Text'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { ASSET_META, CURRENCY_META, gigAmountBounds } from '@tenda/shared'

interface PaymentInputProps {
  /** Asset registry id (CO5), drives decimals, symbol and budget rails. */
  asset: string
  /** Raw units of `asset` (lamports for SOL, 6dp for USDC). */
  value: number
  onChange: (raw: number) => void
}

type Mode = 'FIAT' | 'ASSET'

/**
 * Budget card per `create-gig.html .budget-card`:
 *   inset 72h R14 with mono 22/700 amount + mono 13 unit suffix + mono 12.5 fiat alt right-aligned.
 *   Asset-aware since CO5, the FIAT alt converts via the platform SOL rate
 *   (stables ride the USD leg: NGN-per-USDC ≈ rates.NGN / rates.USD).
 */
export function PaymentInput({ asset, value, onChange }: PaymentInputProps) {
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency)
  const currencyMeta = CURRENCY_META[currency]

  const meta = ASSET_META[asset]
  const symbol = meta?.symbol ?? asset
  const decimals = meta?.decimals ?? 9
  const scale = 10 ** decimals

  // Fiat per display unit of `asset`: SOL rates come straight from the
  // platform cache; stables ≈ USD, so divide out the USD leg.
  const solRate = rates?.[currency] ?? null
  const usdRate = rates?.USD ?? null
  const rate =
    meta?.is_stable === true
      ? solRate !== null && usdRate !== null && usdRate > 0
        ? solRate / usdRate
        : null
      : solRate

  const hasInitial = value > 0
  const [mode, setMode] = useState<Mode>(hasInitial ? 'ASSET' : 'FIAT')
  const [text, setText] = useState(() => (hasInitial ? String(value / scale) : ''))

  const currentUnits = value / scale
  const currentFiat = rate != null ? currentUnits * rate : null

  const { min_raw } = gigAmountBounds(asset)
  const minDisplay = `${min_raw / scale} ${symbol}`

  function handleChangeText(raw: string) {
    setText(raw)
    const num = parseFloat(raw)
    if (isNaN(num) || num <= 0) return

    // No rate yet → a FIAT entry can't convert; emitting it as ASSET units
    // would misprice by orders of magnitude. Wait for the rate (the toggle
    // to the asset tab always works).
    if (mode === 'FIAT' && rate == null) return

    const units = mode === 'FIAT' && rate != null ? num / rate : num
    const { max_raw } = gigAmountBounds(asset)
    onChange(Math.min(Math.round(units * scale), max_raw))
  }

  function toggleMode(next: Mode) {
    setMode(next)
    setText('')
  }

  const fiatAlt =
    mode === 'ASSET' && currentFiat != null
      ? `≈ ${currentFiat.toLocaleString(currencyMeta.locale, { maximumFractionDigits: 0 })} ${currency}`
      : mode === 'FIAT' && currentUnits > 0
        ? `≈ ${currentUnits.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`
        : ''

  const placeholder = mode === 'FIAT' ? currencyMeta.symbol + '0' : '0.00'
  const unitLabel = mode === 'FIAT' ? currency : symbol

  return (
    <View style={s.wrap}>
      <View style={s.modeRow}>
        {(['FIAT', 'ASSET'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => toggleMode(m)}
            style={({ pressed }) => [
              s.modeBtn,
              mode === m && { backgroundColor: theme.colors.brand.primarySurface },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              size={11.5}
              weight="semibold"
              color={mode === m ? theme.colors.brand.primary : theme.colors.content.tertiary}
              style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}
            >
              {m === 'FIAT' ? currency : symbol}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.card, { backgroundColor: theme.colors.surface.inset }]}>
        <Text style={[s.label, { color: theme.colors.content.tertiary }]}>BUDGET</Text>

        <View style={s.row}>
          <TextInput
            value={text}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.content.tertiary}
            keyboardType="decimal-pad"
            style={[
              s.amount,
              { color: text ? theme.colors.content.primary : theme.colors.content.tertiary },
            ]}
            maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
          />
          <Text style={[s.suffix, { color: theme.colors.content.tertiary }]}>{unitLabel}</Text>
        </View>
        {fiatAlt ? (
          <Text style={[s.fiat, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            {fiatAlt}
          </Text>
        ) : null}
      </View>

      <Text size={12} color={theme.colors.content.tertiary} style={s.helper}>
        Minimum {minDisplay}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    gap: 8,
  },
  modeRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  card: {
    minHeight: 72,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  label: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    marginBottom: 4,
    includeFontPadding: false,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fonts.mono,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.44,
    padding: 0,
  },
  suffix: {
    fontFamily: typography.fonts.mono,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.13,
    flexShrink: 0,
  },
  fiat: {
    fontFamily: typography.fonts.mono,
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 4,
  },
  helper: {
    paddingHorizontal: 4,
  },
})
