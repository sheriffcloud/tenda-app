/** Chain receipt state understood by every Tenda transaction monitor. */
export type OnChainTransactionStatus = 'confirmed' | 'finalized' | 'failed' | 'not_found'

/** UI lifecycle before and after a wallet returns a transaction reference. */
export type TransactionProgressPhase =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'broadcasting'
  | 'confirming'
