/**
 * How a transition failure REACHES the user — extracted from useEscrowActions
 * so the hook stays inside the size budget and this stays readable as one
 * decision: which failures are routed, which are expected exits, which stale
 * the screen, and which are simply reported.
 *
 * The ordering is load-bearing and is the whole reason this is one function
 * rather than four checks scattered through a catch block.
 *
 * `features/<domain>/`, beside `features/escrow-proofs/`, rather than
 * `hooks/escrow/`: this is not a hook, and `hooks/` should read as the place
 * hooks are. Not `lib/` either — nothing in there reaches the UI at runtime
 * (media-download.ts takes a TYPE from components and that is the extent of
 * it), while surfacing a toast and a route is this function's entire job.
 */
import {
  classifyTransactionGateError,
  errorMessage,
  isTakedownRefusal,
  TAKEDOWN_REFUSED_MESSAGE,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
  WalletError,
} from '@tenda/shared'
import { showToast } from '@/components/ui'

/** The generic last resort, when the failure named nothing of its own. */
const FALLBACK = 'Transaction failed, please try again'

// Not exported: nothing outside names it, and the two hook-argument interfaces
// next door (`UseApplicationsArgs`, `UseGigApprovalFlowArgs`) are unexported for
// the same reason — an export nobody imports reads as a supported seam.
interface TransitionFailureHandlers {
  /**
   * Send the user to the screen that clears a first-transaction gate. Typed
   * as the gate's OWN return union rather than `string`, so expo-router's
   * typed-route check still applies at the call site.
   */
  navigate: (route: ReturnType<typeof transactionGateRoute>) => void
  /**
   * The server refused because THIS SCREEN is out of date (today only a CO1
   * takedown) — re-read, so the button that was just pressed stops being
   * offered. Optional: a caller that cannot refetch degrades to the toast.
   */
  onStale?: () => void
}

/**
 * Report `error` to the user and take whatever follow-up it implies. Always
 * returns false, so a `catch` can `return surfaceTransitionFailure(...)`.
 */
export function surfaceTransitionFailure(
  error: unknown,
  { navigate, onStale }: TransitionFailureHandlers,
): false {
  // First-transaction gate (9D): route to link-wallet / verify-contact instead
  // of a dead-end toast. The 403 surfaces from the server build-tx call,
  // before any wallet signing.
  const gate = classifyTransactionGateError(error)
  if (gate !== null) {
    showToast('error', TRANSACTION_GATE_MESSAGE[gate])
    navigate(transactionGateRoute(gate))
    return false
  }
  // Guard exits (Cancel button / lost wallet response) are expected paths, not
  // failures — the message already says whether the tx may still sync.
  if (error instanceof WalletError && (error.code === 'declined' || error.code === 'timeout')) {
    showToast('info', error.message)
    return false
  }
  // Taken down (CO1) while this screen was open: the refusal is the FIRST the
  // client hears of it, so a toast alone would leave the same button sitting
  // there to be pressed again. Re-read instead — the party lands on the
  // takedown notice with the entry actions gone, everyone else on "not
  // available". The server's message is preferred (it is written for a
  // stranger whose screen simply went stale) but it falls back to the SHARED
  // constant the server itself sends, NOT to the generic line below: a blank
  // envelope must not turn "this listing is gone" into advice to retry
  // something that will be refused every time.
  //
  // `errorMessage` here is for ONE reading of the thrown value, not protection:
  // `isTakedownRefusal` answers true for `ApiClientError` alone, so this branch
  // can never hold a non-Error. No test can separate it from the cast it
  // replaced — the last resort below is where that case actually lands.
  if (isTakedownRefusal(error)) {
    showToast('error', errorMessage(error) || TAKEDOWN_REFUSED_MESSAGE)
    onStale?.()
    return false
  }
  showToast('error', errorMessage(error) || FALLBACK)
  return false
}
