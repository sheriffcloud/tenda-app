export const REALTIME_RECENT_EVENT_CAPACITY = 2_048

/** Bounded insertion-ordered set; prevents duplicate remote broadcasts. */
export function createRecentEventCache(capacity = REALTIME_RECENT_EVENT_CAPACITY) {
  const ids = new Set<string>()
  return {
    remember(eventId: string): boolean {
      if (ids.has(eventId)) return false
      ids.add(eventId)
      if (ids.size > capacity) {
        const oldest = ids.values().next().value
        if (oldest !== undefined) ids.delete(oldest)
      }
      return true
    },
  }
}
