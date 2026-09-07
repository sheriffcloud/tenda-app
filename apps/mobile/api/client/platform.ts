/**
 * Server-owned facts and one-off writes that belong to no larger domain:
 * platform config + chain registry, the blockchain report/permit seam, media
 * upload signatures, moderation preview, and content reports.
 */
import {
  apiRoutes,
  type ChainRegistryEntry,
  type ClientPingBody,
  type ClientPingResponse,
  type CloudinarySignature,
  type CreateReportInput,
  type ExchangeRates,
  type ModerationPreviewBody,
  type ModerationPreviewResponse,
  type PermitPayloadBody,
  type PermitPayloadResponse,
  type PlatformConfig,
  type UploadSignatureBody,
} from '@tenda/shared'
import { request } from '../request'
import { MODERATION_TIMEOUT_MS, TX_BUILD_TIMEOUT_MS } from './timeouts'

const { platform, blockchain, upload, moderation, reports } = apiRoutes

export const platformApi = {
  config: () => request<PlatformConfig>('GET', platform.config),
  exchangeRates: () => request<ExchangeRates>('GET', platform.exchangeRates),
  // CO5: enabled chains + assets (chain/asset picker source).
  chains: () => request<{ data: ChainRegistryEntry[] }>('GET', platform.chains),
}

export const blockchainApi = {
  clientPing: (body: ClientPingBody) =>
    request<ClientPingResponse>('POST', blockchain.clientPing, { body }),
  // EIP-2612: server-built typed data for eth_signTypedData_v4. Reads
  // name/nonces/DOMAIN_SEPARATOR off the token live → RPC timeout budget.
  permitPayload: (body: PermitPayloadBody) =>
    request<PermitPayloadResponse>('POST', blockchain.permitPayload, {
      body,
      timeout: TX_BUILD_TIMEOUT_MS,
    }),
}

export const uploadApi = {
  signature: (body: UploadSignatureBody) =>
    request<CloudinarySignature>('POST', upload.signature, { body }),
}

export const moderationApi = {
  preview: (body: ModerationPreviewBody) =>
    request<ModerationPreviewResponse>('POST', moderation.preview, {
      body,
      timeout: MODERATION_TIMEOUT_MS,
    }),
}

export const reportsApi = {
  create: (body: CreateReportInput) => request<{ id: string }>('POST', reports.create, { body }),
}
