/**
 * The #60 preview's pill toggle — an eyebrow in a hairline pill that fills
 * with ink when it is the chosen one. The /gigs category chips and the
 * dashboard's my-gigs tabs are the same control with different ARIA (a
 * pressed toggle vs a selected tab), so the treatment lives once here and
 * each caller keeps its own semantics.
 */
import { EYEBROW_ATOM } from './Eyebrow'
import { cn } from '@/lib/cn'

const BASE =
  'inline-flex h-[26px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-full border px-[11px] transition-colors duration-(--motion-fast) ease-(--motion-ease-standard)'
const ON = 'border-content-primary bg-content-primary text-surface-background'
const OFF = 'border-border-default text-content-tertiary hover:border-border-strong hover:text-content-primary'

export function pillToggleClass(on: boolean): string {
  return cn(EYEBROW_ATOM, BASE, on ? ON : OFF)
}
