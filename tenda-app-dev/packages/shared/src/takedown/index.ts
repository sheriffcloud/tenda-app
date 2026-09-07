/**
 * Takedown domain — everything a hidden listing says and refuses.
 *
 * `copy` is what the three audiences read; `refusal` classifies the server
 * declining a WRITE against a hidden escrow (the stale-client case). The
 * banner components stay per-client; the words and rules live here.
 */
export {
  takedownCopy,
  takedownAudience,
  type TakedownAudience,
  type TakedownCopy,
  type TakedownSubject,
  type TakedownEscrow,
} from './copy'
export { isTakedownRefusal } from './refusal'
