export interface RefreshCoordinator {
  request(): void
  stop(): void
}

/** Coalesces concurrent triggers without dropping the final consistency read. */
export function createRefreshCoordinator(refresh: () => void | Promise<void>): RefreshCoordinator {
  let running = false
  let trailing = false
  let stopped = false

  const run = async () => {
    if (stopped) return
    if (running) {
      trailing = true
      return
    }
    running = true
    try {
      await refresh()
    } catch {
      // Refresh failures are recoverable: the next WS/poll/lifecycle trigger
      // retries. Keep fire-and-forget callers from producing an unhandled
      // rejection that can destabilize the React Native runtime.
    } finally {
      running = false
      if (trailing && !stopped) {
        trailing = false
        void run()
      }
    }
  }

  return {
    request: () => void run(),
    stop: () => {
      stopped = true
      trailing = false
    },
  }
}
