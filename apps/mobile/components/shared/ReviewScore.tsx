/**
 * A user's average review score as "★ 4.8".
 *
 * Extracted the moment a second surface needed it (the approval-mode applicant
 * shortlist): `users.review_score` is numeric(3,2) and arrives as a STRING, so
 * every renderer has to remember both the null case and the `Number(...)`
 * coercion. Renders nothing when unrated, which is what "no reviews yet"
 * should look like — not "0.0".
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'

interface Props {
  /** numeric(3,2) on the wire; null when the user has no reviews. */
  score: string | null
  size?: number
}

export function ReviewScore({ score, size = 12 }: Props) {
  const { theme } = useUnistyles()
  if (score === null) return null

  return (
    <View style={s.row}>
      <Text size={size} color={theme.colors.accent.primary}>
        ★
      </Text>
      <Text size={size} color={theme.colors.content.tertiary}>
        {Number(score).toFixed(1)}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
})
