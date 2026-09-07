'use client'

/**
 * The workspace's 380px list column (Tier 2 comp, lines 388-484). Generic over
 * the row type: it owns the header, the three async states, grouping, keyboard
 * cursor and scrolling — never what a row looks like. Row rendering belongs to
 * the ListRow family, so a new surface reuses this untouched.
 */
import { useId, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LIST_KEYBOARD_HINT } from './copy'
import { ListEmpty, ListError, ListSkeleton } from './ListStates'
import { ListHeader } from './ListHeader'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Kbd } from '@/components/ui/Kbd'
import { useListKeyboard } from '@/hooks/workspace/useListKeyboard'
import type { ListColumnProps } from './list.types'

export function ListColumn<TRow>({
  copy,
  groups,
  keyOf,
  hrefOf,
  selectedKey,
  renderRow,
  isLoading = false,
  error = null,
  countLabel,
  tabs,
  onOpenPalette,
  onRetry,
  pinned,
  footer,
  skeletonRows,
  tools,
  filters,
}: ListColumnProps<TRow>) {
  const router = useRouter()
  const titleId = useId()

  // Flattened once per change so the keyboard cursor indexes rows, not
  // groups — the cursor must cross group boundaries as one run.
  const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups])

  // Where the OPEN row sits, when the surface tells us which one is open.
  const selectedIndex = useMemo(
    () => (selectedKey === undefined ? -1 : flat.findIndex((row) => keyOf(row) === selectedKey)),
    [flat, keyOf, selectedKey],
  )

  const { activeIndex, setActiveIndex, activeRowRef } = useListKeyboard({
    count: flat.length,
    // Enabled only while real rows are on screen: keystrokes during a
    // skeleton or an error would move an invisible cursor.
    enabled: !isLoading && error === null && flat.length > 0,
    onOpen: (index) => {
      const row = flat[index]
      if (row !== undefined) router.push(hrefOf(row))
    },
  })

  // Where each group starts in the flat run, so a row's cursor index is pure
  // arithmetic rather than a counter mutated while rendering.
  const groupOffsets = useMemo(
    () =>
      groups.map((_, index) =>
        groups.slice(0, index).reduce((sum, group) => sum + group.rows.length, 0),
      ),
    [groups],
  )

  /**
   * The row wearing the mark. The keyboard cursor when the reader has moved
   * it, and the OPEN row until then — a list beside a detail pane has to say
   * which conversation the pane is showing, and the cursor's own -1 start
   * would leave nothing marked on arrival. The two cannot disagree for long:
   * opening a row by pointer sets the cursor through `onMouseEnter`, and
   * opening by keyboard is the cursor by definition.
   */
  const markedIndex = activeIndex >= 0 ? activeIndex : selectedIndex

  const showList = !isLoading && error === null && flat.length > 0
  const showEmpty = !isLoading && error === null && flat.length === 0

  return (
    <section
      data-list
      aria-labelledby={titleId}
      className="flex min-h-0 min-w-0 flex-col border-r border-border-subtle bg-surface-background"
    >
      <ListHeader
        title={copy.title}
        titleId={titleId}
        countLabel={countLabel}
        tabs={tabs}
        onOpenPalette={onOpenPalette}
        tools={tools}
        filters={filters}
      />

      <div className="flex-1 overflow-y-auto px-2 pb-5 pt-1">
        {/* Above the rows AND outside every async state: a pinned broadcast is
            not part of the list it sits over, so an empty or failed personal
            feed must not take it off the screen. */}
        {pinned}
        {isLoading && <ListSkeleton rows={skeletonRows} />}
        {!isLoading && error !== null && <ListError code={error} onRetry={onRetry} />}
        {showEmpty && <ListEmpty title={copy.emptyTitle} body={copy.emptyBody} />}

        {showList && (
          <div>
            {groups.map((group, groupIndex) => {
              const labelled = group.label !== undefined && group.label !== ''
              // The heading NAMES its run of rows rather than floating above
              // it as a paragraph — visual grouping alone reaches assistive
              // tech as nothing (spec-correction #16, same call).
              const groupLabelId = `${titleId}-${group.key}`
              return (
              <div key={group.key} className="mb-2">
                {labelled && (
                  <Eyebrow id={groupLabelId} strong className="mx-3 mb-1.5 mt-3">
                    {group.label}
                  </Eyebrow>
                )}
                <ul
                  aria-labelledby={labelled ? groupLabelId : undefined}
                  // No gap: the rows are hairline-ruled (#60), and a gap
                  // between ruled rows reads as a broken rule.
                  className="flex flex-col"
                >
                  {group.rows.map((row, rowIndex) => {
                    const index = groupOffsets[groupIndex] + rowIndex
                    const active = index === markedIndex
                    return (
                      <li
                        key={keyOf(row)}
                        ref={active ? activeRowRef : undefined}
                        // Pointer users get the same cursor as keyboard users,
                        // so the two never disagree about "current".
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        {renderRow(row, { active })}
                      </li>
                    )
                  })}
                </ul>
              </div>
              )
            })}
            {footer}
            <p className="m-3 text-xs leading-[18px] text-content-tertiary">
              {LIST_KEYBOARD_HINT.move.map((key) => (
                <span key={key} className="mr-1"><Kbd>{key}</Kbd></span>
              ))}{' '}
              move · <Kbd>{LIST_KEYBOARD_HINT.open}</Kbd> open · {LIST_KEYBOARD_HINT.suffix}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
