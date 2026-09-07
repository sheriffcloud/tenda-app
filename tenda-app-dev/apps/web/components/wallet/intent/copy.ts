/**
 * The intent page's strings, and the one derivation that decides its tone.
 */
import { isTerminal, type FiatIntentDetail, type FiatIntentStatus } from '@tenda/shared'

export type IntentTone = 'pending' | 'settled' | 'failed'

/**
 * Three tones, not seven statuses. `settled` is the only good ending and the
 * other terminal states are the only bad ones — everything else is still
 * moving, and colouring "waiting for the provider" as a failure would tell a
 * reader their money is gone while it is in flight.
 */
export function intentTone(status: FiatIntentStatus): IntentTone {
  if (status === 'settled') return 'settled'
  return isTerminal(status) ? 'failed' : 'pending'
}

export const INTENT_COPY = {
  back: 'Wallet',
  heading: (direction: FiatIntentDetail['direction']) =>
    direction === 'onramp' ? 'Buying crypto' : 'Cashing out',
  goneTitle: 'This transaction no longer exists',
  goneBody:
    'It may have been cancelled, or it was never yours. Nothing of yours was affected.',
  loadingLabel: 'Loading this transaction',
  expiresIn: 'Time left to pay',
  /** What the reader is waiting on, per tone — the comp's `intent.body`. */
  body: (tone: IntentTone) =>
    tone === 'settled'
      ? 'The money has settled. Nothing further is needed from you.'
      : tone === 'failed'
        ? 'Nothing was taken. You can start another cash-out whenever you like.'
        : 'Leave this page open or come back to it, the status updates on its own.',
  rows: {
    amount: 'Amount',
    receive: 'You receive',
    rate: 'Rate',
    fee: 'Fee',
    provider: 'Handled by',
    reference: 'Reference',
    started: 'Started',
  },
  cancel: 'Cancel transaction',
  cancelConfirmTitle: 'Cancel this transaction?',
  cancelConfirmBody: 'Nothing has moved yet, and you can start another one whenever you like.',
  /**
   * Deliberately NOT the trigger's own words: a dialog whose confirm button
   * repeats the button that opened it reads as a no-op, and "Cancel" facing
   * "Cancel transaction" is the classic way to cancel the wrong thing.
   */
  cancelConfirmLabel: 'Yes, cancel it',
  done: 'Back to wallet',
} as const
