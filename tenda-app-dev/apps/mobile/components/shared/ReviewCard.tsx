import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Star } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Avatar } from '@/components/ui/Avatar'
import { Text } from '@/components/ui/Text'
import { formatRelativeShort, formatFullName } from '@tenda/shared'
import type { Review } from '@tenda/shared'

interface ReviewCardProps {
  review: Review
  reviewer: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  }
  label: string
}

export function ReviewCard({ review, reviewer, label }: ReviewCardProps) {
  const { theme } = useUnistyles()

  const name = formatFullName(reviewer.first_name, reviewer.last_name) || 'Anonymous'
  const time = formatRelativeShort(review.created_at)

  return (
    <View style={[s.row, { borderBottomColor: theme.colors.border.subtle }]}>
      <Avatar size="sm" name={name} src={reviewer.avatar_url} />
      <View style={s.body}>
        <View style={s.head}>
          <Text style={[s.name, { color: theme.colors.content.primary }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={s.stars}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={12}
                color={theme.colors.accent.primary}
                fill={i < review.score ? theme.colors.accent.primary : 'transparent'}
                strokeWidth={i < review.score ? 0 : 1.5}
              />
            ))}
          </View>
          <Text style={[s.time, { color: theme.colors.content.tertiary }]}>
            {time}
          </Text>
        </View>
        {review.comment ? (
          <Text style={[s.comment, { color: theme.colors.content.secondary }]}>
            {review.comment}
          </Text>
        ) : null}
        {label ? (
          <Text style={[s.label, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.14,
    flexShrink: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
    flexShrink: 0,
  },
  time: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 11.5,
    lineHeight: 14,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  comment: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  // The "About the poster / worker" caption IS the eyebrow — the token style,
  // not a near copy of it (10/13/+0.6 sat here beside the eyebrow's
  // 9.5/12/+0.95 while web drew the same label through its Eyebrow, #59c).
  label: {
    ...typography.styles.eyebrow,
    textTransform: 'uppercase',
    marginTop: 6,
  },
})
