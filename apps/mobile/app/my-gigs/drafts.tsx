/**
 * Drafts — the caller's unfunded staging gigs, reached from the banner at the
 * top of My Gigs → Posted.
 *
 * This was a fourth tab on My Gigs until the row ran out of horizontal space
 * (see DraftsBanner). A pushed screen suits drafts better anyway: they are the
 * only surface these rows are reachable from, so they want the room, and the
 * chain filter here scopes one list instead of three.
 */
import { View, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { FileClock } from 'lucide-react-native'
import type { GigSummary } from '@tenda/shared'
import { ScreenContainer, EmptyState, Header, PaginatedList } from '@/components/ui'
import { ChainFilterChips } from '@/components/filters'
import { GigCardCompact, GigListSkeleton } from '@/components/gig'
import { useDraftGigs } from '@/hooks/useDraftGigs'
import { spacing } from '@/theme/tokens'

export default function DraftsScreen() {
  const { theme } = useUnistyles()
  const [chainId, setChainId] = useState<string | null>(null)

  const list = useDraftGigs(chainId)

  // Deleting a draft or funding one happens on the gig detail screen, which is
  // pushed on top of this one — so returning here must re-read rather than show
  // a row that no longer exists. `reload` is the silent variant: no spinner over
  // a list the user is already looking at.
  const hasFetchedRef = useRef(false)
  hasFetchedRef.current = list.hasFetched
  useFocusEffect(
    useCallback(() => {
      // Page 0 on mount and on chain change is owned by the list controller, so
      // only a LATER focus re-reads here.
      if (hasFetchedRef.current) void list.reload()
      // `reload` is stable and the flag is read through a ref, so this must not
      // re-fire when a load settles — only on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header title="Drafts" showBack />

      <ChainFilterChips value={chainId} onChange={setChainId} gutterX={spacing.md} />

      <PaginatedList<GigSummary>
        list={list}
        keyOf={(gig) => gig.escrow_id}
        renderItem={({ item }) => <GigCardCompact gig={item} showStatus />}
        contentContainerStyle={s.list}
        separatorHeight={spacing.sm}
        onRefresh={() => void list.refresh()}
        skeleton={<GigListSkeleton variant="priceLeading" count={3} />}
        empty={
          <View style={s.empty}>
            <EmptyState
              icon={<FileClock size={40} color={theme.colors.content.secondary} />}
              title="No drafts"
              description="Gigs you start but do not fund are kept here"
            />
          </View>
        }
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  empty: {
    paddingTop: spacing['2xl'],
  },
})
