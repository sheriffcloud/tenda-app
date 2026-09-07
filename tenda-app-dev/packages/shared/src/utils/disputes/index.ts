/**
 * Dispute-surface utilities: the thread feed builder and the send-error
 * classifier both dispute screens (party + admin) share.
 */
export {
  buildDisputeFeed,
  isDisputeDay,
  type DisputeDayItem,
  type DisputeRowItem,
  type DisputeFeedItem,
} from './thread'
export {
  classifyDisputeSendError,
  disputeSendMessage,
  type DisputeSendFailure,
  type DisputeSendResult,
  type DisputeSendSubject,
} from './send-error'
