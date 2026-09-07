import { StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

interface Props {
  label: string
  value: string
  emphasized?: boolean
}

/** Label + right-aligned value line for review/summary cards. */
export function ReviewRow({ label, value, emphasized = false }: Props) {
  const { theme } = useUnistyles()
  return (
    <View style={s.row}>
      <Text variant="caption" color={theme.colors.content.secondary}>{label}</Text>
      <Text
        variant="caption"
        weight={emphasized ? 'bold' : 'semibold'}
        color={emphasized ? theme.colors.brand.primary : theme.colors.content.primary}
        numberOfLines={1}
        style={s.value}
      >
        {value}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  value: { flex: 1, textAlign: 'right' },
})
