import { View, Pressable, StyleSheet } from 'react-native'
import { Star } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'

type Score = 1 | 2 | 3 | 4 | 5

interface StarRatingProps {
  value: Score | null
  onChange?: (score: Score) => void
  readonly?: boolean
  size?: number
}

export function StarRating({ value, onChange, readonly = false, size = 32 }: StarRatingProps) {
  const { theme } = useUnistyles()

  return (
    <View style={s.row}>
      {([1, 2, 3, 4, 5] as Score[]).map((star) => {
        const filled = value !== null && star <= value
        return (
          <Pressable
            key={star}
            onPress={() => !readonly && onChange?.(star)}
            disabled={readonly}
            hitSlop={8}
          >
            <Star
              size={size}
              color={filled ? theme.colors.feedback.warning.base : theme.colors.content.secondary}
              fill={filled ? theme.colors.feedback.warning.base : 'transparent'}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
