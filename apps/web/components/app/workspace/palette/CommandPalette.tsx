'use client'

/**
 * ⌘K palette (Tier 2 comp, lines 713-736). Composes the one overlay
 * primitive, so the focus trap, focus restore and Escape all come from
 * ModalBackdrop rather than being hand-rolled here.
 *
 * The combobox/listbox pairing is what makes it usable without sight: the
 * input keeps focus while the arrow keys move a VIRTUAL cursor, and
 * aria-activedescendant tells the reader which option that cursor is on.
 * Moving real focus into the list instead would break typing.
 */
import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'
import {
  PALETTE_EMPTY_COPY,
  PALETTE_PLACEHOLDER,
  filterCommands,
  type PaletteCommand,
} from './palette-commands'

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: readonly PaletteCommand[]
  onClose: () => void
}) {
  const router = useRouter()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  // A shrinking result set must not strand the cursor past the end. Derived
  // for the same reason as the list column's: no render can observe an
  // out-of-range index.
  const activeIndex = Math.min(cursor, results.length - 1)
  const active = activeIndex >= 0 ? results[activeIndex] : undefined

  function go(command: PaletteCommand) {
    onClose()
    router.push(command.href)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // While an IME composition is open the arrows move the CANDIDATE list and
    // Enter COMMITS the candidate — both belong to the input method, not the
    // palette. Without this, a CJK reader's first Enter navigates them away
    // mid-word. Same guard ChatInput already applies to sending a message.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor(Math.min(activeIndex + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter' && active !== undefined) {
      event.preventDefault()
      go(active)
    }
  }

  return (
    <ModalBackdrop
      label="Command palette"
      onBackdropClick={onClose}
      initialFocus="first"
      // Top-aligned, not centred: the comps anchor it near the top so the
      // result list grows downward into stable space as you type.
      cardClassName="max-w-[560px] gap-0 overflow-hidden p-0 self-start mt-[12vh]"
    >
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4.5 py-3.5">
        <Search size={18} aria-hidden className="shrink-0 text-content-tertiary" />
        <input
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={active === undefined ? undefined : `${listId}-${active.id}`}
          aria-label={PALETTE_PLACEHOLDER}
          autoComplete="off"
          placeholder={PALETTE_PLACEHOLDER}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent type-title font-normal text-control-input-text outline-none placeholder:text-content-placeholder"
        />
        <kbd className="shrink-0 rounded-[5px] border border-border-default px-1.5 py-0.5 font-numeric type-caption text-content-tertiary">
          esc
        </kbd>
      </div>

      <ResultCount count={results.length} />

      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[46vh] overflow-y-auto p-2">
        {results.map((command, index) => {
          const Icon = command.icon
          const isActive = index === activeIndex
          return (
            <li key={command.id} id={`${listId}-${command.id}`} role="option" aria-selected={isActive}>
              <button
                type="button"
                // Pointer and keyboard share one cursor, as in the list column.
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(command)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-control border px-3 py-2.5 text-left type-button',
                  isActive
                    ? 'border-control-selected-border bg-control-selected-background text-brand-primary'
                    : 'border-transparent text-content-primary',
                )}
              >
                <Icon size={16} aria-hidden className="shrink-0 text-content-tertiary" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                <span className="shrink-0 font-numeric type-caption text-content-tertiary">
                  {command.hint}
                </span>
              </button>
            </li>
          )
        })}
        {results.length === 0 && (
          <p className="p-6 text-center type-body-small text-content-tertiary">
            {PALETTE_EMPTY_COPY}
          </p>
        )}
      </ul>
    </ModalBackdrop>
  )
}

/**
 * Announces how many results the query produced. Without it, a sightless
 * reader types and hears nothing — the list updates silently below them.
 */
function ResultCount({ count }: { count: number }) {
  // Rendered directly, not mirrored into state: aria-live announces on
  // content CHANGE, so the text only has to be correct for the current
  // render — a setState round trip would just add a cascading render.
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {count === 1 ? '1 result' : `${count} results`}
    </p>
  )
}
