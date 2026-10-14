import type { ExchangePartyRef } from '../types/exchange'

/** "Wisdom A." — the name a stranger may see before anyone has committed. */
export function abbreviatedName(first_name: string | null, last_name: string | null): string {
  const first = (first_name ?? '').trim()
  const last = (last_name ?? '').trim()
  const initial = last === '' ? '' : `${Array.from(last)[0]}.`
  return [first, initial].filter((part) => part !== '').join(' ')
}

/** The two fields every viewer-scoped identity carries. */
export type ScopedNameFields = Pick<ExchangePartyRef, 'full_name' | 'display_name'>

/** Prefer a server-revealed legal name, otherwise use its public label. */
export function scopedName(party: ScopedNameFields): string {
  return party.full_name || party.display_name
}
