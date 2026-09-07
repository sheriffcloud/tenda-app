'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CREATE_OPTIONS } from '@/components/create/create-options'
import { cn } from '@/lib/cn'

export function CreateMenu({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLAnchorElement>('[role="menuitem"]')?.focus()
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={root} className="relative w-full px-3">
      {open && (
        <div
          role="menu"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'),
            )
            const current = items.indexOf(document.activeElement as HTMLAnchorElement)
            const offset = event.key === 'ArrowDown' ? 1 : -1
            items[(current + offset + items.length) % items.length]?.focus()
          }}
          className={cn(
            'absolute z-30 rounded-card border border-border-default bg-surface-card p-1.5 shadow-elevated',
            expanded
              ? 'bottom-[calc(100%+8px)] left-3 right-3'
              : 'bottom-0 left-[calc(100%+8px)] w-48',
          )}
        >
          {CREATE_OPTIONS.map(({ href, menuLabel, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold text-content-secondary hover:bg-surface-inset hover:text-content-primary">
              <Icon size={17} aria-hidden /> {menuLabel}
            </Link>
          ))}
        </div>
      )}
      <button ref={trigger} type="button" aria-label="Create" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className={cn('flex h-10 w-full items-center rounded-control border border-control-selected-border bg-control-selected-background text-brand-primary hover:bg-brand-solid hover:text-brand-on-primary', expanded ? 'gap-3 px-3' : 'justify-center')}>
        <Plus size={20} aria-hidden />
        {expanded && <span className="text-sm font-semibold">Create</span>}
      </button>
    </div>
  )
}
