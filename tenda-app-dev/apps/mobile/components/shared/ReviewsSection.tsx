import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { ReviewCard } from './ReviewCard'
import type { Review } from '@tenda/shared'

interface ReviewParty {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

interface Props {
  reviews: Review[]
  partyAId: string
  partyA: ReviewParty
  partyALabel: string
  partyB: ReviewParty | null | undefined
  partyBLabel: string
  currentUserId: string
  /** Override the section title; default "Reviews" */
  title?: string
  /** Optional trailing label or "See all" affordance */
  trailing?: string
}

export function ReviewsSection({
  reviews,
  partyAId,
  partyA,
  partyALabel,
  partyB,
  partyBLabel,
  currentUserId,
  title = 'Reviews',
  trailing,
}: Props) {
  const { theme } = useUnistyles()

  if (reviews.length === 0) return null

  return (
    <View>
      <View style={s.header}>
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {trailing && (
          <Text style={[s.trailing, { color: theme.colors.content.tertiary }]}>
            {trailing}
          </Text>
        )}
      </View>
      {reviews.map((review) => {
        const isPartyA = review.reviewer_id === partyAId
        const reviewer = isPartyA ? partyA : partyB
        const roleLabel = isPartyA ? partyALabel : partyBLabel
        const label = review.reviewer_id === currentUserId
          ? `Your review (${roleLabel})`
          : `${roleLabel}'s review`
        if (!reviewer) return null
        return (
          <ReviewCard
            key={review.id}
            review={review}
            reviewer={reviewer}
            label={label}
          />
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.17,
  },
  trailing: {
    fontSize: 12.5,
    lineHeight: 16,
  },
})
