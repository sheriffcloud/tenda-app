import { useRef, useState, type ReactElement } from 'react'
import { View, StyleSheet, ScrollView, Animated, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ClipboardList } from 'lucide-react-native'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import type { GigSummary, MyApplication } from '@tenda/shared'
import { spacing } from '@/theme/tokens'
import { ScreenContainer, EmptyState, Header, PaginatedList, ConfirmDialog } from '@/components/ui'
import { PagerTabBar } from '@/components/navigation'
import { ChainFilterChips } from '@/components/filters'
import { GigCardCompact, GigListSkeleton, DraftsBanner } from '@/components/gig'
import {
  MyApplicationCard,
  useApplications,
  MY_APPLICATIONS_EMPTY,
  WITHDRAW_CONFIRM,
} from '@/components/gig/gig-applications'
import { useMyGigs } from '@/hooks/useMyGigs'
import type { PaginatedListState } from '@/hooks/usePaginatedList'

// Matches the list gutter below it. The old 20pt value aligned with nothing —
// it just cost 40pt of a ~375pt row, which is what squeezed "Working" and
// "Applied" against their count chips back when Drafts was a fourth tab.
const TAB_INSET = spacing.md

interface EmptyCopy {
  title: string
  description: string
}

/**
 * The pager carries two row shapes now — gigs, and the caller's own
 * applications — so each page declares which it is instead of the loop
 * assuming a single item type.
 */
type PagerPage =
  | {
      key: string
      label: string
      kind: 'gigs'
      list: PaginatedListState<GigSummary>
      empty: EmptyCopy
      /** Rendered above the rows, and kept mounted when the list is empty. */
      header?: ReactElement
    }
  | {
      key: string
      label: string
      kind: 'applications'
      list: PaginatedListState<MyApplication>
      empty: EmptyCopy
    }

export default function MyGigsScreen() {
  const { theme }     = useUnistyles()
  const { width: SW } = useWindowDimensions()
  const router        = useRouter()
  const { posted, working, drafts, applications, chainId, setChainId } = useMyGigs()

  const [pageIndex, setPageIndex] = useState(0)
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null)

  const applicationActions = useApplications({ onChanged: () => void applications.refresh() })

  const scrollRef = useRef<ScrollView>(null)
  const scrollX   = useRef(new Animated.Value(0)).current

  function scrollToPage(index: number) {
    setPageIndex(index)
    scrollRef.current?.scrollTo({ x: index * SW, animated: true })
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SW)
    if (index !== pageIndex) setPageIndex(index)
  }

  // Counts come from the server total for each list — all load on mount, so
  // no chip reads 0 just because its tab hasn't been opened yet. Drafts stay a
  // separate query precisely so "Posted" can mean posted: a draft is an
  // unfunded staging row, and counting it here inflated the number the user
  // reads as "gigs I put out there".
  const pages: PagerPage[] = [
    {
      key: 'posted',
      label: 'Posted',
      kind: 'gigs',
      list: posted,
      empty: { title: 'No gigs posted yet', description: 'Post your first gig to get started' },
      // In the header rather than above the pager, so it scrolls away instead
      // of permanently stacking a fourth row of furniture under the chips. The
      // header stays mounted when the list is empty, which is the case that
      // matters most: a user whose only gigs ARE drafts sees the empty Posted
      // state and the route to them together.
      header: (
        <DraftsBanner
          count={drafts.hasFetched ? drafts.total : 0}
          onPress={() => router.push('/my-gigs/drafts')}
        />
      ),
    },
    {
      key: 'working',
      label: 'Working',
      kind: 'gigs',
      list: working,
      empty: { title: 'Not working on any gigs', description: 'Browse the feed to find and accept gigs' },
    },
    {
      key: 'applications',
      label: 'Applied',
      kind: 'applications',
      list: applications,
      empty: MY_APPLICATIONS_EMPTY,
    },
  ]

  function renderEmpty(empty: EmptyCopy) {
    return (
      <View style={s.empty}>
        <EmptyState
          icon={<ClipboardList size={40} color={theme.colors.content.secondary} />}
          title={empty.title}
          description={empty.description}
        />
      </View>
    )
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header title="My Gigs" showBack />

      <PagerTabBar
        // No chip until the list has actually loaded: `total` is 0 before the
        // first response, and rendering that reads as a confident "you have
        // none" — the very symptom this screen was fixed for.
        tabs={pages.map((p) => ({
          key: p.key,
          label: p.label,
          count: p.list.hasFetched ? p.list.total : undefined,
        }))}
        activeIndex={pageIndex}
        scrollX={scrollX}
        pageWidth={SW}
        onTabPress={scrollToPage}
        insetX={TAB_INSET}
      />

      {/*
        Outside the pager, deliberately. Nested inside it — as a list header on
        each page — this row is a horizontal ScrollView inside a horizontal
        pagingEnabled ScrollView, so the pager claimed every pan and swiping the
        chips switched tabs instead. Hoisting also collapses what were two
        instances of one control: `chainId` is shared by the gig tabs.

        It does NOT scope Applied: /v1/applications is caller-scoped with no
        chain parameter, and silently ignoring the active chip would be worse
        than not offering it.
      */}
      <ChainFilterChips value={chainId} onChange={setChainId} gutterX={spacing.md} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={handleScrollEnd}
        style={s.pager}
      >
        {pages.map((page) => (
          <View key={page.key} style={{ width: SW }}>
            {page.kind === 'gigs' ? (
              <PaginatedList<GigSummary>
                list={page.list}
                keyOf={(gig) => gig.escrow_id}
                renderItem={({ item }) => <GigCardCompact gig={item} showStatus />}
                header={page.header}
                contentContainerStyle={s.list}
                separatorHeight={spacing.sm}
                onRefresh={() => void page.list.refresh()}
                // This screen had NO loading state at all: the first load and
                // every chain-chip tap showed a bare chip row (or the previous
                // chain's rows) with nothing signalling a fetch.
                skeleton={<GigListSkeleton variant="priceLeading" count={3} />}
                empty={renderEmpty(page.empty)}
              />
            ) : (
              <PaginatedList<MyApplication>
                list={page.list}
                keyOf={(row) => row.application.id}
                renderItem={({ item }) => (
                  <MyApplicationCard
                    row={item}
                    busy={applicationActions.busy}
                    onWithdraw={setWithdrawing}
                  />
                )}
                contentContainerStyle={s.list}
                separatorHeight={spacing.md}
                onRefresh={() => void page.list.refresh()}
                skeleton={<GigListSkeleton variant="priceLeading" count={3} />}
                empty={renderEmpty(page.empty)}
              />
            )}
          </View>
        ))}
      </ScrollView>

      <ConfirmDialog
        {...WITHDRAW_CONFIRM}
        visible={withdrawing !== null}
        loading={applicationActions.busy}
        onConfirm={() => {
          const row = withdrawing
          setWithdrawing(null)
          if (row !== null) void applicationActions.withdraw(row.gig.escrow_id)
        }}
        onCancel={() => setWithdrawing(null)}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  pager: { flex: 1 },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  empty: {
    paddingTop: spacing['2xl'],
  },
})
