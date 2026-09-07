/** Platform-neutral transaction progress and recovery copy for mobile and web clients. */
export const TRANSACTION_COPY = {
  preparingTitle: 'Preparing transaction…',
  preparingCaption: 'Getting your request ready, one moment.',
  signingTitle: 'Approve in your wallet',
  signingCaption: 'Your wallet is opening — approve the transaction there to continue.',
  broadcastingTitle: 'Submitting transaction…',
  broadcastingCaption: 'Your wallet approval was received.',
  slowBroadcastCaption: 'This is taking longer than usual. Keep Tenda open while we check the submission.',
  offlineBroadcastCaption: 'You appear to be offline. Reconnect to let Tenda check the submission.',
  solanaBroadcastUncertain:
    'We could not confirm whether Solana received the transaction. Check your connection, wait a moment, then refresh before trying again.',
  syncingTitle: 'Syncing with Tenda…',
  syncingCaption: 'Confirmed on-chain. Updating your gig now.',
  confirmingTitle: 'Confirming transaction…',
  confirmingCaption: 'Confirming on-chain. This may take a few seconds.',
  deferredTitle: 'Sync is taking longer',
} as const
