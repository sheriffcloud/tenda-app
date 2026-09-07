export { WalletError, type WalletErrorCode } from './errors'
export type { WalletAccount, SignMessageResult, AuthenticateResult } from './types'
export { connectThenSign, isUserRejection, type ConnectSignParts } from './connect-then-sign'
export { classifyConnectError, type ConnectErrorCopy } from './connect-error'
export * from './balances'
export { evmRpc, evmRpcString, hexToDecimalString, addressWord, amountWord } from './evm-rpc'
export {
  gigChainOptions,
  chainOptionLabel,
  composerWalletGate,
  composerWalletNotice,
  defaultGigChainId,
  type ComposerWalletGate,
  type GigChainOption,
  type ChainOptionState,
} from './gig-chain-options'
export { sellWalletNotice, sellWalletSection } from './sell-precondition'
export {
  resolveWalletSection,
  isRegistryUsable,
  type WalletSectionState,
  type WalletSectionInput,
  type WalletLoadStatus,
  type WalletsStatus,
  type ChainRegistryStatus,
} from './section-state'
export {
  TX_LABEL_BY_ROLE,
  viewerRole,
  txLabel,
  txSign,
  txAmountRaw,
  txDisplayAmount,
} from './tx-copy'
export {
  encodeApprove,
  displayToAmountRaw,
  readAllowance,
  sendApprove,
  waitForReceipt,
  ensureAllowance,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_POLL_TIMEOUT_MS,
  type SendEvmTx,
} from './allowance'
export {
  guardWalletRequest,
  subscribePendingWalletRequest,
  hasPendingWalletRequest,
  abortPendingWalletRequest,
  WC_REQUEST_TIMEOUT_MS,
  WC_DISCONNECT_CAP_MS,
  WC_TIMEOUT_MESSAGE,
  WC_CANCELLED_MESSAGE,
} from './request-guard'
export {
  isLinkedWallet,
  pickWalletAddress,
  orderedSignerAddresses,
  preferredWalletAddress,
  sameWalletAddress,
  verifiedWalletsOn,
} from './wallet-address'
export {
  createSolanaRpcTransport,
  classifySolanaRpcError,
  isRetryableSolanaRpcError,
  type SolanaRpcTransport,
  type SolanaRpcErrorKind,
  type SolanaConnectionPort,
  type SolanaConnectionFactory,
} from './solana-rpc'
export { getEvmTransactionStatus } from './evm-tx-status'
