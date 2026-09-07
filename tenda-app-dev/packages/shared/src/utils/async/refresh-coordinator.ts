/**
 * Coalesces concurrent refresh triggers into at most one trailing run, so the
 * FINAL consistency read is never dropped.
 *
 * The problem it solves: an escrow's live view is poked from three directions
 * — a WebSocket event, a focus poll, and a lifecycle resume — and those arrive
 * together far more often than they arrive alone. Firing a refresh per trigger
 * hammers the API; firing only the first one loses whatever the last trigger
 * was telling you about, which is exactly the read that reflects the state the
 * user just caused.
 *
 * Shared since #40. Both clients had this file character-identical apart from
 * one clause of one comment, each with its own 40-odd-line test suite proving
 * the same three behaviours — 93 lines of test for one 30-line machine, and a
 * trailing-edge fix to either side would silently have missed the other.
 * Generic and side-effect-free, like `withTimeout` beside it: no React, no
 * platform API, no imports at all.
 */
export interface RefreshCoordinator {
  request(): void
  stop(): void
}

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
      // retries. Swallowed so fire-and-forget callers cannot produce an
      // unhandled rejection — which on React Native can destabilize the
      // runtime, and in a browser is a console error nobody can action.
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
