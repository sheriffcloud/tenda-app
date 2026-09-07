import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { formatRelativeDay } from '@/lib/date'

interface Props {
  iso: string
}

export function ChatTimestampGroup({ iso }: Props) {
  const { theme } = useUnistyles()
  return (
    <View style={s.row}>
      <Text style={[s.label, { color: theme.colors.content.tertiary }]}>
        {formatRelativeDay(iso)}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  label: {
    fontFamily: typography.fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.55,
  },
})
