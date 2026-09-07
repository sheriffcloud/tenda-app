/**
 * Debounce a rapidly-changing value (a search box). Needed the moment a
 * filter drives a NETWORK request instead of an in-memory array filter —
 * without it every keystroke is a request, and the responses race.
 */
import { useEffect, useState } from 'react'

export const SEARCH_DEBOUNCE_MS = 350

export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
