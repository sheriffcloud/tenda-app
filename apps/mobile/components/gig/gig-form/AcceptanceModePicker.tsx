/**
 * How the gig gets a worker: first-come, or the poster approves.
 *
 * Framed as a trade-off rather than a setting, because it is one — approval
 * costs the poster an extra transaction and the delay of deciding, and buys
 * them a choice of worker. Both consequences are stated so the pricier option
 * is not chosen by accident.
 *
 * Direct invite is the third mode the contracts support, but it needs a
 * specific person's account and there is no way to name one from this form
 * yet, so it is not offered here.
 *
 * No heading of its own. `GigDeliveryStep` supplies the SectionLabel for every
 * section it composes ("Who can take it", "Proof of completion", "Review") and
 * this picker has exactly that one caller, so owning a second one only stacked
 * two near-identical headings on the poster.
 */
import { View, StyleSheet, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

interface Props {
  requiresApproval: boolean
  onChange: (requiresApproval: boolean) => void
}

const OPTIONS: readonly { value: boolean; title: string; body: string }[] = [
  {
    value: false,
    title: 'First come, first served',
    body: 'The first worker to accept gets the gig and starts straight away.',
  },
  {
    value: true,
    title: 'I approve the worker',
    body: 'Workers apply, you pick one. Costs you one extra transaction, and the gig only starts when you choose.',
  },
]

export function AcceptanceModePicker({ requiresApproval, onChange }: Props) {
  const { theme } = useUnistyles()

  return (
    <View style={s.group}>
      {OPTIONS.map((option) => {
        const selected = option.value === requiresApproval
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              s.option,
              {
                backgroundColor: theme.colors.surface.card,
                borderColor: selected ? theme.colors.brand.primary : theme.colors.border.default,
                borderWidth: selected ? 2 : 1,
              },
              pressed && !selected && { opacity: 0.7 },
            ]}
          >
            <Text weight="semibold">{option.title}</Text>
            <Text variant="caption" color={theme.colors.content.secondary}>
              {option.body}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  group: { paddingHorizontal: spacing.md, gap: spacing.sm, marginTop: spacing.xs },
  option: { borderRadius: radius.md, padding: spacing.md, gap: 4 },
})
