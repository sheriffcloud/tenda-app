import { TRANSACTION_RESILIENCE } from '@tenda/shared'

export const ESCROW_RPC_POLL_MS = TRANSACTION_RESILIENCE.confirmationPollMs
export const ESCROW_SYNC_POLL_MS = TRANSACTION_RESILIENCE.projectionPollMs
export const ESCROW_SYNC_TIMEOUT_MS = TRANSACTION_RESILIENCE.confirmationTimeoutMs
export const ESCROW_CONFIRM_DISMISS_MS = TRANSACTION_RESILIENCE.confirmedDismissMs
