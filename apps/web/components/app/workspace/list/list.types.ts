import type { ReactNode } from 'react'

/** One tab in the list header, with its own count. */
export interface ListTab {
  href: string
  label: string
  /** Rendered beside the label in tabular numerals; omit when unknown. */
  count?: number
  current?: boolean
}

/**
 * A run of rows under an optional heading — the comps' day-grouping and any
 * other sectioning a surface needs. A group without a label renders its rows
 * ungrouped, so a flat list is just one unlabelled group.
 */
export interface ListGroup<TRow> {
  key: string
  label?: string
  rows: readonly TRow[]
}

/** The strings that differ per surface. */
export interface ListSurfaceCopy {
  /** The column heading, and the list's accessible name. */
  title: string
  emptyTitle: string
  emptyBody: string
}

export interface ListColumnProps<TRow> {
  copy: ListSurfaceCopy
  groups: readonly ListGroup<TRow>[]
  /** Stable identity per row — also the React key. */
  keyOf: (row: TRow) => string
  /** Where Enter (and a click) takes this row. */
  hrefOf: (row: TRow) => string
  /**
   * `keyOf` of the row whose detail is open, when the surface has one. It
   * wears the cursor's mark until the reader moves the cursor, so a list
   * beside a detail pane says which row the pane is showing.
   */
  selectedKey?: string
  renderRow: (row: TRow, state: { active: boolean }) => ReactNode
  isLoading?: boolean
  error?: string | null
  /** Monospace count line under the title, e.g. "12 open". */
  countLabel?: string
  tabs?: readonly ListTab[]
  /** Opens the command palette; the ⌘K button is hidden when absent. */
  onOpenPalette?: () => void
  /** Controls on the title row's right — a view toggle (#60). */
  tools?: ReactNode
  /** Controls under the title row — a search field, a chip row (#60). */
  filters?: ReactNode
  /** Re-runs the fetch from the error state. Omit only for a list that cannot fail. */
  onRetry?: () => void
  /**
   * Rendered ABOVE the rows and outside the async states — the notification
   * centre's pinned announcements. They are not rows of this list, so an empty
   * or failed list must not take them off the screen.
   */
  pinned?: ReactNode
  /**
   * Rendered after the rows and before the keyboard hint — a "load more" for
   * the surfaces whose index is paginated. Only shown with rows on screen: a
   * pager under a skeleton or an error state is a control over nothing.
   */
  footer?: ReactNode
  skeletonRows?: number
}
