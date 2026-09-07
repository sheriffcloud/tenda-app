import { View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'

interface DividerProps {
  spacing?: number
  color?: string
}

export function Divider({ spacing: verticalSpacing, color }: DividerProps) {
  const { theme } = useUnistyles()

  return (
    <View
      style={{
        height: 1,
        backgroundColor: color ?? theme.colors.border.subtle,
        marginVertical: verticalSpacing ?? spacing.md,
      }}
    />
  )
}
