import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { AlertTriangle, Info } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text, Spacer } from '@/components/ui'

interface GuideStepProps {
  step: number
  title: string
  description?: string
  warning?: string
  tip?: string
}

/**
 * Wireframe `guide-step`. 32×32 brand-tinted mono number circle + title /
 * description stack, with optional warning (warn-surface, left border) or
 * tip (info-surface, left border) callout below.
 */
export function GuideStep({ step, title, description, warning, tip }: GuideStepProps) {
  const { theme } = useUnistyles()

  return (
    <View style={s.row}>
      <View style={[s.num, { backgroundColor: theme.colors.brand.primarySurface }]}>
        <Text style={[s.numText, { color: theme.colors.brand.primary }]}>{step}</Text>
      </View>

      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]}>{title}</Text>

        {description && (
          <>
            <Spacer size={3} />
            <Text style={[s.desc, { color: theme.colors.content.secondary }]}>{description}</Text>
          </>
        )}

        {warning && (
          <View
            style={[
              s.variant,
              {
                backgroundColor: theme.colors.feedback.warning.surface,
                borderLeftColor: theme.colors.feedback.warning.base,
              },
            ]}
          >
            <View style={s.variantHead}>
              <AlertTriangle size={11} color={theme.colors.feedback.warning.base} />
              <Text style={[s.variantLabel, { color: theme.colors.feedback.warning.base }]}>
                WARNING
              </Text>
            </View>
            <Text style={[s.variantText, { color: theme.colors.feedback.warning.base }]}>
              {warning}
            </Text>
          </View>
        )}

        {tip && (
          <View
            style={[
              s.variant,
              {
                backgroundColor: theme.colors.feedback.info.surface,
                borderLeftColor: theme.colors.feedback.info.base,
              },
            ]}
          >
            <View style={s.variantHead}>
              <Info size={11} color={theme.colors.feedback.info.base} />
              <Text style={[s.variantLabel, { color: theme.colors.feedback.info.base }]}>
                TIP
              </Text>
            </View>
            <Text style={[s.variantText, { color: theme.colors.feedback.info.base }]}>
              {tip}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: false,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.07,
  },
  desc: {
    fontSize: 13,
    lineHeight: 20,
  },
  variant: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  variantHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  variantLabel: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  variantText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
})
