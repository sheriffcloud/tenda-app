/**
 * The one FlatList wrapper every paginated surface renders through, driven by
 * a `usePaginatedList` controller. Centralising it keeps the end-reach
 * threshold, footer spinner, refresh control and "empty vs not-yet-fetched"
 * distinction identical across the feed, the order book, my gigs and my
 * trades — those had drifted into four slightly different hand-rolled lists.
 */
import { useMemo, type ReactElement } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  RefreshControl,
  View,
  type ListRenderItem,
  type ViewStyle,
} from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { END_REACHED_THRESHOLD } from '@/lib/pagination'
import type { PaginatedListState } from '@/hooks/usePaginatedList'

/**
 * Stable empty data for the "page 0 in flight" render (see `data` below).
 * `readonly never[]` is assignable to `readonly TItem[]`, so no cast.
 */
const NO_ROWS: readonly never[] = []

interface PaginatedListProps<TItem> {
  list: PaginatedListState<TItem>
  keyOf: (item: TItem) => string
  renderItem: ListRenderItem<TItem>
  /**
   * Shown in the BODY while page 0 loads — on mount and on every filter
   * change. Give it intrinsic height (placeholder cards, not a `flex: 1`
   * spinner): it renders inside the list's content container, below the
   * header, so a flex-filling child collapses.
   */
  skeleton?: ReactElement
  /** Shown when a settled load produced no rows. */
  empty?: ReactElement
  /** Shown instead of the list when the first page failed. */
  errorState?: ReactElement
  header?: ReactElement
  /**
   * Vertical gap between rows, in px. A number rather than an element on
   * purpose: an element prop is rebuilt by the caller on every render, so the
   * `() => separator` component handed to FlatList changes identity each time
   * and every separator remounts. Every call site wanted a plain gap anyway.
   */
  separatorHeight?: number
  contentContainerStyle?: ViewStyle
  style?: ViewStyle
  /** Pull-to-refresh. Omit to disable (e.g. a list inside a horizontal pager). */
  onRefresh?: () => void
  testID?: string
}

export function PaginatedList<TItem>({
  list,
  keyOf,
  renderItem,
  skeleton,
  empty,
  errorState,
  header,
  separatorHeight,
  contentContainerStyle,
  style,
  onRefresh,
  testID,
}: PaginatedListProps<TItem>) {
  const { theme } = useUnistyles()

  // Stable component identity per height, so separators aren't remounted on
  // every render of the list.
  const Separator = useMemo(
    () =>
      separatorHeight === undefined
        ? undefined
        : () => <View style={{ height: separatorHeight }} />,
    [separatorHeight],
  )

  // `isLoading` is true only for a page-0 load that changes the list's
  // IDENTITY — mount, a filter change, or the gate opening. Pull-to-refresh
  // (`isRefreshing`) and polling (`reload`) deliberately leave it false, so
  // neither can pull rows out from under the user.
  const showSkeleton = skeleton !== undefined && list.isLoading
  // A first-page failure with no rows is an error body, not an empty list;
  // once rows exist a later failure must not blank them out.
  const showError =
    errorState !== undefined && list.error !== null && list.items.length === 0

  /**
   * The body slot: skeleton → error → empty, arbitrated here and handed to
   * `ListEmptyComponent` so the FlatList — and with it the caller's HEADER —
   * always stays mounted.
   *
   * This used to `return skeleton` / `return errorState` in place of the whole
   * list, which unmounted the header too. On the home feed that header holds
   * the featured rail and the category + chain chip rows, so any chain-chip
   * tap made while the list was empty blanked the entire screen, reset the
   * chip row's scroll offset, and refetched the rail on remount.
   */
  const body = showSkeleton
    ? skeleton
    : showError
      ? errorState
      : // Never claim "nothing here" before the first load settles — that
        // reads as an empty account rather than a pending fetch.
        list.hasFetched && !list.isLoading
        ? empty
        : undefined

  /**
   * While page 0 is in flight the loaded rows belong to the query the user
   * just LEFT: rendering them under a freshly-tapped chip both contradicts
   * that chip and, with no progress signal anywhere, is indistinguishable
   * from a frozen screen. Blanking the data hands the body to the skeleton
   * instead. Only when a skeleton exists — a caller without one keeps the
   * previous stale-rows behaviour rather than flashing an empty body.
   */
  const data = showSkeleton ? NO_ROWS : list.items

  return (
    <FlatList
      testID={testID}
      style={style}
      data={data}
      keyExtractor={keyOf}
      renderItem={renderItem}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      ItemSeparatorComponent={Separator}
      onEndReached={list.loadMore}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      refreshControl={
        onRefresh === undefined ? undefined : (
          <RefreshControl
            refreshing={list.isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand.primary}
          />
        )
      }
      ListFooterComponent={
        list.isLoadingMore ? (
          <ActivityIndicator style={s.footer} color={theme.colors.brand.primary} />
        ) : (
          <View style={s.footerSpacer} />
        )
      }
      ListEmptyComponent={body}
    />
  )
}

const s = StyleSheet.create({
  footer: { paddingVertical: spacing.md },
  footerSpacer: { height: spacing['2xl'] },
})
