import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { chainLabel } from '@/lib/chains'

/** Small chain marker: names the network an escrow/gig lives on. */
export function ChainBadge({ chainId, style }: { chainId: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.badge, { backgroundColor: theme.colors.surface.inset }, style]}>
      <Text size={10.5} weight="semibold" color={theme.colors.content.secondary}>
        {chainLabel(chainId)}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
})
