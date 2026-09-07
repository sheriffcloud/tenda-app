export type EscrowConfirmationState = 'waiting' | 'syncing' | 'applied' | 'failed' | 'deferred'

export interface EscrowConfirmationResult {
  state: EscrowConfirmationState
  failure: string
}
