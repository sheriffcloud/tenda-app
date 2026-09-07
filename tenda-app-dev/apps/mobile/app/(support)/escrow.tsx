import { useState } from 'react'
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, TextInput } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { InfoCard } from '@/components/support'
import { typography } from '@/theme/tokens'
import { formatFiat, APP_INFO, SUPPORT_ESCROW_FLOW, SUPPORT_ESCROW_INTRO, SUPPORT_FEE_NOTE } from '@tenda/shared'
import { useSettingsStore } from '@/stores/settings.store'


export default function EscrowGuideScreen() {
  const { theme } = useUnistyles()
  const currency = useSettingsStore((s) => s.currency)
  const [gigAmount, setGigAmount] = useState('')

  const numericAmount = parseFloat(gigAmount.replace(/,/g, '')) || 0
  const platformFee = numericAmount * (APP_INFO.fees.platformFeePct / 100)
  const workerReceives = numericAmount - platformFee
  const hasAmount = numericAmount > 0

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
        <Header title="Payments & Escrow" showBack />

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <InfoCard label={SUPPORT_ESCROW_INTRO.label} body={SUPPORT_ESCROW_INTRO.body} />

          {/* Money flow */}
          <InfoCard label="How the money moves">
            <View style={s.flowCol}>
              {SUPPORT_ESCROW_FLOW.map((step, i) => (
                <View key={step.num}>
                  <View style={s.flowStep}>
                    <View style={[s.flowNum, { backgroundColor: theme.colors.brand.primarySurface }]}>
                      <Text style={[s.flowNumText, { color: theme.colors.brand.primary }]}>{step.num}</Text>
                    </View>
                    <View style={s.flowBody}>
                      <Text style={[s.flowTitle, { color: theme.colors.content.primary }]}>{step.title}</Text>
                      <Text style={[s.flowDesc, { color: theme.colors.content.secondary }]}>{step.desc}</Text>
                    </View>
                  </View>
                  {i < SUPPORT_ESCROW_FLOW.length - 1 && (
                    <View style={[s.flowConnector, { backgroundColor: theme.colors.border.default }]} />
                  )}
                </View>
              ))}
            </View>
          </InfoCard>

          {/* Fee calculator */}
          <InfoCard label="Fee calculator">
            <View
              style={[
                s.feeInput,
                {
                  borderColor: hasAmount ? theme.colors.brand.primary : theme.colors.border.default,
                  backgroundColor: theme.colors.surface.background,
                },
              ]}
            >
              <Eyebrow>{`Gig amount (${currency})`}</Eyebrow>
              <TextInput
                value={gigAmount}
                onChangeText={setGigAmount}
                placeholder="e.g. 25,000"
                placeholderTextColor={theme.colors.content.tertiary}
                keyboardType="numeric"
                style={[s.feeInputValue, { color: theme.colors.content.primary }]}
              />
            </View>

            {hasAmount && (
              <View
                style={[
                  s.feeBreakdown,
                  {
                    backgroundColor: theme.colors.surface.inset,
                    borderColor: theme.colors.border.default,
                  },
                ]}
              >
                <FeeRow label="Gig amount" value={formatFiat(numericAmount, currency)} />
                <FeeRow
                  label={`Tenda fee (${APP_INFO.fees.platformFeePct}%)`}
                  value={`−${formatFiat(platformFee, currency)}`}
                  tone="danger"
                />
                <View style={[s.totalRow, { borderTopColor: theme.colors.border.subtle }]}>
                  <Text style={[s.feeLabelTotal, { color: theme.colors.content.primary }]}>
                    Worker receives
                  </Text>
                  <Text style={[s.feeValueTotal, { color: theme.colors.feedback.success.base }]}>
                    {formatFiat(workerReceives, currency)}
                  </Text>
                </View>
              </View>
            )}

            <Text style={[s.feeNote, { color: theme.colors.content.tertiary }]}>
              {SUPPORT_FEE_NOTE}
            </Text>
          </InfoCard>

          {/* Disputes & refunds */}
          <View
            style={[
              s.accordionCard,
              { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
            ]}
          >
            <AccordionItem title="What happens if we disagree?" defaultExpanded>
              <Text style={[s.accordionBody, { color: theme.colors.content.secondary }]}>
                Either side can raise a dispute. A Tenda moderator reviews proofs, chat history, and on-chain state, then releases funds to the winning party. Decisions are recorded on-chain.
              </Text>
            </AccordionItem>
            <AccordionItem title="Can I cancel and get a refund?" last>
              <Text style={[s.accordionBody, { color: theme.colors.content.secondary }]}>
                Refunds go back to the poster automatically when the gig expires with no worker accepting it, or when a dispute is resolved in the poster’s favour.
              </Text>
            </AccordionItem>
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  )
}

function FeeRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'danger' }) {
  const { theme } = useUnistyles()
  const valueColor = tone === 'danger' ? theme.colors.feedback.danger.base : theme.colors.content.primary
  return (
    <View style={s.feeRow}>
      <Text style={[s.feeLabel, { color: theme.colors.content.secondary }]}>{label}</Text>
      <Text style={[s.feeValue, { color: valueColor }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingBottom: 16,
  },
  flowCol: {
    marginTop: 4,
  },
  flowStep: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 4,
    minHeight: 52,
  },
  flowNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  flowNumText: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
  },
  flowBody: {
    flex: 1,
    paddingTop: 6,
  },
  flowTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.07,
  },
  flowDesc: {
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 3,
  },
  flowConnector: {
    width: 2,
    height: 16,
    marginLeft: 17,
  },
  feeInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  feeInputValue: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.18,
    padding: 0,
    marginTop: 2,
  },
  feeBreakdown: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
  },
  feeLabel: {
    fontSize: 13.5,
  },
  feeValue: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.065,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  feeLabelTotal: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  feeValueTotal: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.16,
  },
  feeNote: {
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 10,
  },
  accordionCard: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
  accordionBody: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingBottom: 16,
  },
})
