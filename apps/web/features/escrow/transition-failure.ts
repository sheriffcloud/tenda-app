/**
 * How a transition failure REACHES the user — web twin of mobile's
 * `features/escrow/transition-failure.ts`, and extracted from
 * `useEscrowActions` for the same reason it was extracted there: the hook sat
 * at the 300-line ceiling, and this reads as ONE decision — which failures are
 * routed, which are expected exits, which stale the screen, and which are
 * simply reported.
 *
 * The ordering is load-bearing, and is the whole reason this is one function
 * rather than four checks scattered through a catch block.
 *
 * `features/<domain>/` rather than `hooks/escrow/`: this is not a hook, and
 * surfacing a toast and a route is its entire job. It stays inside the coverage
 * gate through vitest.config's `{hooks,features}` entry — it was gated as part
 * of `useEscrowActions` and must not fall out of the gate just by moving.
 */
import {
  TAKEDOWN_REFUSED_MESSAGE,
  TRANSACTION_GATE_MESSAGE,
  TX_FAILURE_FALLBACK,
  WC_CANCELLED_MESSAGE,
  WalletError,
  classifyTransactionGateError,
  errorMessage,
  isTakedownRefusal,
  isUserRejection,
  transactionFailureMessage,
  transactionGateRoute,
} from '@tenda/shared'
import { showToast } from '@/components/ui/Toast'

interface TransitionFailureHandlers {
  /** Send the user to the screen that clears a first-transaction gate. */
  navigate: (route: ReturnType<typeof transactionGateRoute>) => void
  /**
   * The server refused because THIS SCREEN is out of date (today only a CO1
   * takedown) — re-read, so the button just pressed stops being offered.
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
  // of a dead-end toast. The 403 surfaces from the server build-tx call.
  const gate = classifyTransactionGateError(error)
  if (gate !== null) {
    showToast('error', TRANSACTION_GATE_MESSAGE[gate])
    navigate(transactionGateRoute(gate))
    return false
  }
  // Guard exits (Cancel / lost wallet response) and a wallet-side refusal are
  // expected paths, not failures. `isUserRejection` answers for BOTH the typed
  // WalletError('declined') and the raw EIP-1193 4001 a browser provider
  // actually throws — only the network SWITCH mapped that one, so declining
  // the transaction ITSELF used to be reported as a failure below.
  if (isUserRejection(error) || (error instanceof WalletError && error.code === 'timeout')) {
    showToast('info', transactionFailureMessage(error) || WC_CANCELLED_MESSAGE)
    return false
  }
  // Taken down (CO1) while this screen was open: re-read so the button the user
  // just pressed stops being offered. The server's message is preferred; the
  // fallback is the SHARED constant the server itself sends, NOT the generic
  // line below — a blank envelope must not turn "this listing is gone" into
  // advice to retry something that will be refused every time.
  //
  // `errorMessage` here reads a value `isTakedownRefusal` has already proven to
  // be an `ApiClientError`, so this branch can never hold a non-Error.
  if (isTakedownRefusal(error)) {
    showToast('error', errorMessage(error) || TAKEDOWN_REFUSED_MESSAGE)
    onStale?.()
    return false
  }
  // `transactionFailureMessage`, not `errorMessage`: a wallet rejects with a
  // plain JSON-RPC object, so the reason it gave ("insufficient funds for gas",
  // a revert string) is not carried on an Error and was being dropped for the
  // generic fallback.
  showToast('error', transactionFailureMessage(error) || TX_FAILURE_FALLBACK)
  return false
}
