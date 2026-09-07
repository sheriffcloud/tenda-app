/**
 * The two whole-page states' strings (Auth comp, lines 638-676).
 *
 * The error screen's body is the load-bearing sentence and it is the comp's:
 * someone whose screen just broke mid-escrow needs to be told, first, that
 * nothing they cannot see moved. Everything about this app that matters is
 * on-chain or on the server, and neither depends on this page rendering.
 */
export const ERROR_COPY = {
  title: 'Something broke on this screen',
  body: 'Only the view failed. Your escrows, balances and messages are untouched — nothing on the chain depends on this page rendering.',
  retry: 'Try this screen again',
  home: 'Start over',
  /**
   * Next hands the boundary a `digest` — the server-side hash of the real
   * error. The comp draws a trace id here and this is the honest version of
   * one: quotable to support, and meaningless to anyone else. It is absent for
   * a purely client-side throw, and the line is then absent too rather than
   * printing a label with nothing after it.
   */
  trace: (digest: string) => `Trace ${digest}`,
} as const

export const OFFLINE_COPY = {
  title: 'You are offline',
  body: 'Signing in needs a connection. Gigs you already opened stay readable from this device, and amounts shown may be stale.',
  availableTitle: 'Available offline',
  available: [
    'Gigs cached from your last visit',
    'Message threads you have already opened',
    'Nothing that moves money — that always needs the chain',
  ],
  retry: 'Try again',
  /** The banner, for a connection that drops while the app is open. */
  banner: 'You are offline. Amounts and messages may be out of date.',
} as const
