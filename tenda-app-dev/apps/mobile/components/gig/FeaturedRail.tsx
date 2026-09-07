/**
 * CO8 featured rail, horizontal carousel of admin-curated listings at the
 * top of the home feed. Renders nothing while empty or failed: curation is
 * decoration, never a blocker.
 */
import { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Sparkles } from 'lucide-react-native'
import type { GigSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { Text } from '@/components/ui/Text'
import { GigCardCompact } from '@/components/gig/GigCardCompact'
import { spacing } from '@/theme/tokens'

const CARD_WIDTH = 280

interface Props {
  /** Bumped by pull-to-refresh so the rail reloads with the feed. */
  refreshKey?: number
}

export function FeaturedRail({ refreshKey = 0 }: Props) {
  const { theme } = useUnistyles()
  const [gigs, setGigs] = useState<GigSummary[]>([])

  const load = useCallback(async () => {
    try {
      const { data } = await api.gigs.featured()
      setGigs(data)
    } catch {
      // Silent: an empty rail is the correct degraded state.
      setGigs([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  if (gigs.length === 0) return null

  return (
    <View style={s.wrap}>
      <View style={s.titleRow}>
        <Sparkles size={15} color={theme.colors.brand.primary} />
        <Text weight="semibold" color={theme.colors.content.primary}>
          Featured
        </Text>
      </View>
      <FlatList
        data={gigs}
        horizontal
        keyExtractor={(g) => g.escrow_id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <View style={s.card}>
            <GigCardCompact gig={item} variant="rich" />
          </View>
        )}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.sm },
  card: { width: CARD_WIDTH },
})
