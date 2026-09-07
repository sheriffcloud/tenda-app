import { useState } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet } from 'react-native'
import { Bell, Search as SearchIcon } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  ScreenContainer,
  FilterSheet,
  EmptyState,
  PaginatedList,
} from '@/components/ui'
import { ErrorState } from '@/components/feedback'
import { GigCardCompact, GigListSkeleton } from '@/components/gig'
import { FeedHeader } from '@/components/gig/feed/FeedHeader'
import { Drawer, DrawerHeader } from '@/components/navigation'
import { spacing } from '@/theme/tokens'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { formatFullName } from '@tenda/shared'
import type { GigSummary, GigCategory } from '@tenda/shared'

export default function HomeScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [railRefreshKey, setRailRefreshKey] = useState(0)
  const router = useRouter()
  const { theme } = useUnistyles()
  const user = useAuthStore((s) => s.user)
  const unreadNotifications = useNotificationsStore((s) => s.unread)

  const { list, filters, hasFilters, setFilter, setLocation, clearAll } = useHomeFeed()

  function handleRefresh() {
    setRailRefreshKey((k) => k + 1)
    void list.refresh()
  }

  return (
    <Drawer
      isOpen={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
    >
      <DrawerHeader
        title="Tenda"
        onMenuPress={() => setDrawerOpen(true)}
        rightIcon={Bell}
        badgeCount={unreadNotifications}
        onRightPress={() => router.push('/notifications' as Parameters<typeof router.push>[0])}
        onAvatarPress={() => router.push('/(tabs)/profile')}
        userImage={user?.avatar_url}
        userName={formatFullName(user?.first_name ?? null, user?.last_name ?? null) || 'Anonymous'}
        showAvatar
      />
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
        <PaginatedList<GigSummary>
          list={list}
          keyOf={(gig) => gig.escrow_id}
          renderItem={({ item }) => <GigCardCompact gig={item} variant="rich" />}
          contentContainerStyle={s.list}
          onRefresh={handleRefresh}
          separatorHeight={10}
          // Body-only: the header (rail + category/chain chips) stays put, so
          // a chain-chip tap swaps the rows, not the screen.
          skeleton={<GigListSkeleton variant="rich" />}
          errorState={
            <ErrorState
              title="Failed to load gigs"
              description={list.error ?? undefined}
              ctaLabel="Retry"
              onCtaPress={() => void list.refresh()}
            />
          }
          header={
            <FeedHeader
              railRefreshKey={railRefreshKey}
              hasFilters={hasFilters}
              category={filters.category}
              chainId={filters.chainId}
              onOpenFilter={() => setFilterOpen(true)}
              onCategoryChange={(c) => setFilter('category', c)}
              onChainChange={(c) => setFilter('chainId', c)}
            />
          }
          empty={
            <EmptyState
              variant="compact"
              icon={<SearchIcon size={22} color={theme.colors.content.tertiary} />}
              title="No gigs found"
              description="Try adjusting your filters or check back later."
              action={hasFilters ? { label: 'Clear filters', onPress: clearAll } : undefined}
            />
          }
        />

        <FilterSheet
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          query={filters.query}
          onQueryChange={(q) => setFilter('query', q)}
          selectedCategory={filters.category}
          onCategoryChange={(c) => setFilter('category', (c ?? null) as GigCategory | null)}
          country={filters.country}
          city={filters.city}
          onLocationChange={setLocation}
          remote={filters.remote}
          onRemoteChange={(r) => setFilter('remote', r)}
          crossBorder={filters.crossBorder}
          onCrossBorderChange={(v) => setFilter('crossBorder', v)}
          onClearAll={clearAll}
        />
      </ScreenContainer>
    </Drawer>
  )
}

const s = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
  },
})
