import type { FiatInstruction, FiatIntentStatus } from '../api/contracts/fiat.contract'

/** User-facing line for a payment/deposit instruction (stage-8 mobile). */
export function instructionCopy(instruction: FiatInstruction): string {
  if ('deposit_address' in instruction) {
    return `Send the exact amount to ${instruction.deposit_address}${instruction.memo !== null ? ` (memo: ${instruction.memo})` : ''}.`
  }
  switch (instruction.kind) {
    case 'bank_transfer':
      return `Transfer to ${instruction.bank_name} ${instruction.account_number} (${instruction.account_name}). Use narration: ${instruction.narration}`
    case 'ussd':
      return `Dial ${instruction.code} to complete payment.`
    case 'redirect':
      return 'Continue on the provider page to complete payment.'
    case 'p2p':
      return 'Your offer is live on the P2P exchange, publish it to match with a buyer.'
  }
}

export const INTENT_STATUS_COPY: Record<FiatIntentStatus, string> = {
  quoted: 'Waiting for your confirmation',
  awaiting_user: 'Waiting for your payment',
  awaiting_provider: 'Waiting for the provider',
  settling: 'Settling…',
  settled: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** Statuses the user can still cancel from the app. */
export function isCancellable(status: FiatIntentStatus): boolean {
  return status === 'quoted' || status === 'awaiting_user'
}

/** Terminal statuses stop the resume screen's polling. */
export function isTerminal(status: FiatIntentStatus): boolean {
  return status === 'settled' || status === 'failed' || status === 'cancelled'
}
