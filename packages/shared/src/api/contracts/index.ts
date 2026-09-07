import type { AuthContract } from './auth.contract'
import type { EscrowsContract } from './escrows.contract'
import type { GigsContract } from './gigs.contract'
import type { UsersContract } from './users.contract'
import type { UploadContract } from './upload.contract'
import type { BlockchainContract } from './blockchain.contract'
import type { PlatformContract } from './platform.contract'
import type { ConversationsContract } from './conversations.contract'
import type { NotificationsContract } from './notifications.contract'
import type { SubscriptionsContract } from './subscriptions.contract'
import type { ReportsContract } from './reports.contract'
import type { ExchangeContract } from './exchange.contract'
import type { ModerationContract } from './moderation.contract'
import type { FiatContract } from './fiat.contract'
import type { DisputesContract } from './disputes.contract'
import type { ApplicationsContract } from './applications.contract'

export interface ApiContract {
  auth: AuthContract
  escrows: EscrowsContract
  disputes: DisputesContract
  gigs: GigsContract
  applications: ApplicationsContract
  users: UsersContract
  upload: UploadContract
  blockchain: BlockchainContract
  platform: PlatformContract
  conversations: ConversationsContract
  notifications: NotificationsContract
  subscriptions: SubscriptionsContract
  reports: ReportsContract
  exchange: ExchangeContract
  moderation: ModerationContract
  fiat: FiatContract
}

export { parseWsServerFrame } from './parse-ws-server-frame'

export type {
  AuthContract,
  AuthNonceResponse,
  AuthMethodWire,
  ChallengeBody,
  ChallengeResponse,
  VerifyBody,
  VerifyResponse,
  IdentityMethodWire,
  LoginMethodsResponse,
  ChainNamespace,
  LinkedWallet,
  LinkWalletBody,
  LinkWalletResponse,
  WalletRefBody,
  UnlinkWalletResponse,
  SetPrimaryWalletResponse,
} from './auth.contract'
export type {
  EscrowsContract,
  UnsignedTx,
  WireUserOperation,
  PermitSignatureBody,
  CreateEscrowApiBody,
  CreateEscrowApiResponse,
  EscrowActionResponse,
  SubmitEscrowProofBody,
  AddEscrowProofsBody,
  DisputeEscrowApiBody,
  ResolveEscrowApiBody,
  ClientPingBody,
  ClientPingResponse,
} from './escrows.contract'
export type { GigsContract } from './gigs.contract'
export type { DisputesContract } from './disputes.contract'
export type { UsersContract, MeUser, MeResponse, UpdateMeInput, UpdateMeResponse, RestrictionKind, UserStandingResponse, MyRestriction, MyStandingResponse } from './users.contract'
export type { UploadContract, UploadSignatureBody } from './upload.contract'
export type {
  BlockchainContract,
  PermitTypedData,
  PermitPayloadBody,
  PermitPayloadResponse,
} from './blockchain.contract'
export type { PlatformContract, PlatformConfig, ExchangeRates, ChainRegistryEntry } from './platform.contract'
export type { ConversationsContract } from './conversations.contract'
export type { NotificationsContract } from './notifications.contract'
export type { SubscriptionsContract } from './subscriptions.contract'
export type { ReportsContract } from './reports.contract'
export type { ExchangeContract } from './exchange.contract'
export type {
  FiatContract,
  FiatDirection,
  FiatIntentStatus,
  FiatQuoteBody,
  FiatQuoteResponse,
  FiatInstruction,
  FiatInitiateBody,
  FiatOfframpInitiateBody,
  FiatInitiateResponse,
  FiatIntentDetail,
  BankAccountSummary,
  CreateBankAccountBody,
} from './fiat.contract'
export type {
  ModerationContract,
  ModerationDecision,
  ModerationReason,
  ModerationPreviewBody,
  ModerationPreviewResponse,
} from './moderation.contract'
export {
  WS_PATH,
  WS_AUTH_SUBPROTOCOL,
  wsChannelName,
  type WsChannelKind,
  type ChatMessageFrame,
  type EscrowEventFrame,
  type NotificationFrame,
  GIG_FEED_CHANNEL,
  type GigAvailableFrame,
  type GigUnavailableFrame,
  type GigUnavailableCause,
  type GigFeedServerFrame,
  type WsServerFrame,
} from './ws.contract'
