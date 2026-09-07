import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { Avatar } from '@/components/ui/Avatar'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { StandingBadge } from '@/components/reputation'
import { ReviewScore } from './ReviewScore'
import { formatFullName } from '@tenda/shared'

interface PersonCardUser {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  /** numeric(3,2), string on the wire, null when unrated. */
  review_score: string | null
  is_seeker?: boolean
}

interface Props {
  label: string
  user: PersonCardUser
  currentUserId: string
  contextId: string
  contextTitle: string
  isOffer?: boolean
  showMessageButton?: boolean
  /** Avatar gradient, `'accent'` (default, sellers/posters) or `'brand'` (buyers) */
  gradient?: 'accent' | 'brand'
  /** Override the trailing pill label, defaults to "Message" */
  ctaLabel?: string
}

export function PersonCard({
  label,
  user,
  currentUserId,
  contextId,
  contextTitle,
  isOffer = false,
  showMessageButton = true,
  gradient = 'accent',
  ctaLabel = 'Message',
}: Props) {
  const { theme } = useUnistyles()
  const router = useRouter()

  const displayName = formatFullName(user.first_name, user.last_name) || 'Anonymous'
  const isSelf = currentUserId === user.id

  function handleMessage() {
    const kind = isOffer ? 'exchange' : 'gig'
    router.push(
      `/chat/${user.id}?escrowId=${contextId}&escrowTitle=${encodeURIComponent(contextTitle)}&kind=${kind}` as Parameters<typeof router.push>[0]
    )
  }

  return (
    <View>
      <Eyebrow style={s.eyebrowSpacing}>{label}</Eyebrow>
      <View style={s.row}>
        <Avatar size="lg" name={displayName} src={user.avatar_url} gradient={gradient} />
        <View style={s.body}>
          <Text
            style={[s.name, { color: theme.colors.content.primary }]}
            numberOfLines={1}
          >
            {isSelf ? 'You' : displayName}
          </Text>
          <View style={s.meta}>
            {/* Shared with the applicant shortlist — one place owns the
                null case and the numeric(3,2)-as-string coercion. */}
            <ReviewScore score={user.review_score} />
            {user.is_seeker && (
              <>
                {user.review_score != null && (
                  <Text style={[s.metaSep, { color: theme.colors.content.tertiary }]}>·</Text>
                )}
                <Text style={[s.metaText, { color: theme.colors.content.tertiary }]}>
                  Seeker
                </Text>
              </>
            )}
          </View>
          <StandingBadge userId={user.id} displayName={isSelf ? 'You' : displayName} />
        </View>
        {!isSelf && showMessageButton && (
          <Pressable
            onPress={handleMessage}
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: theme.colors.surface.inset },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={`${ctaLabel} ${displayName}`}
            accessibilityRole="button"
          >
            <Text style={[s.ctaText, { color: theme.colors.content.primary }]}>
              {ctaLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  eyebrowSpacing: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  metaSep: {
    fontSize: 12.5,
    lineHeight: 16,
    opacity: 0.5,
  },
  cta: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ctaText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
  },
})
