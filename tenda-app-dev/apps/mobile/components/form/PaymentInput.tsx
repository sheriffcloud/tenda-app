import { useState } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import { Text } from '@/components/ui/Text'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import {
  ASSET_META,
  CURRENCY_META,
  gigBudgetRangeLabel,
  gigBudgetToRaw,
  gigBudgetToText,
  hasGigBudget,
  sanitizeGigBudgetText,
  sanitizeDecimalText,
  FIAT_ENTRY_DECIMALS,
} from '@tenda/shared'
import {
  fiatRatePerUnit,
  fiatTextToRaw,
  useDenominationSync,
} from './payment-input/payment-input.fiat'

interface PaymentInputProps {
  /** Asset registry id (CO5), drives decimals, symbol and budget rails. */
  asset: string
  /**
   * Budget in raw units of `asset`, as a base-unit string; '' when unset.
   * A string because an 18-decimal budget is past what a number can hold —
   * see @tenda/shared's gig-budget helpers, which own the conversion.
   */
  value: string
  onChange: (raw: string) => void
}

type Mode = 'FIAT' | 'ASSET'

/**
 * Budget card per `create-gig.html .budget-card`:
 *   inset 72h R14 with mono 22/700 amount + mono 13 unit suffix + mono 12.5 fiat alt right-aligned.
 *   Asset-aware since CO5, the FIAT alt converts via the platform SOL rate
 *   (stables ride the USD leg: NGN-per-USDC ≈ rates.NGN / rates.USD).
 *
 * NO "this asset cannot be priced" STATE, deliberately (#81). `fiatRatePerUnit`
 * answers null FOREVER for a native token that is not SOL, and a fresh composer
 * opens on the FIAT tab — so such an asset would sit in the rates-unknown path
 * looking like a load that never finishes, with nothing telling the reader the
 * difference. It cannot get here: `asset` is policy-derived rather than picked,
 * taken from `gigAssetByChain`, and every chain in the manifest gives the 'gig'
 * role to a USDC stable. A state for it would be a control for a case the
 * producer cannot emit; keeping that true is a test's job instead, and
 * packages/shared/test/chains/gig-asset-pricing.test.ts fails the day a chain
 * gives the role to something this rule cannot price.
 */
export function PaymentInput({ asset, value, onChange }: PaymentInputProps) {
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency)
  const currencyMeta = CURRENCY_META[currency]

  const meta = ASSET_META[asset]
  const symbol = meta?.symbol ?? asset

  const rate = fiatRatePerUnit(rates, currency, asset)

  const hasInitial = hasGigBudget(value)
  const [mode, setMode] = useState<Mode>(hasInitial ? 'ASSET' : 'FIAT')
  const [text, setText] = useState(() => gigBudgetToText(value, asset))

  // Display magnitude only — safe as a number, and the fiat alt is an
  // approximation by construction ('≈'). The RAW never goes through here.
  const currentUnits = hasInitial ? Number(gigBudgetToText(value, asset)) : 0
  const currentFiat = rate != null ? currentUnits * rate : null

  const rangeDisplay = gigBudgetRangeLabel(asset)

  useDenominationSync({ asset, value, mode, currency, rate, text, setText, onChange })

  function handleChangeText(typed: string) {
    // In ASSET mode the field IS the amount, so it is precision-limited at
    // entry. In FIAT mode it is a fiat amount that happens to share the
    // widget — the asset's decimals say nothing about how many kobo a reader
    // may type, so only the character filter applies.
    const next =
      mode === 'ASSET'
        ? sanitizeGigBudgetText(typed, asset)
        : sanitizeDecimalText(typed, FIAT_ENTRY_DECIMALS)
    setText(next)

    if (mode === 'ASSET') {
      onChange(gigBudgetToRaw(next, asset))
      return
    }

    // No rate yet → a FIAT entry can't convert; emitting it as ASSET units
    // would misprice by orders of magnitude. Wait for the rate: null here is a
    // CACHE state, never a property of the asset — every gig asset is priceable
    // once the rates land (see the header) — and the toggle to the asset tab
    // works regardless.
    if (rate === null || rate <= 0) return
    onChange(fiatTextToRaw(next, rate, asset))
  }

  function toggleMode(next: Mode) {
    setMode(next)
    setText('')
    // The cleared field is a cleared budget. Leaving the old raw behind let
    // the step stay satisfied by a number that was no longer on screen.
    onChange('')
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
        Budget {rangeDisplay}
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
    fontFamily: typography.fonts.mono.semibold,
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
    fontFamily: typography.fonts.mono.bold,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.44,
    padding: 0,
  },
  suffix: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.13,
    flexShrink: 0,
  },
  fiat: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 4,
  },
  helper: {
    paddingHorizontal: 4,
  },
})
