/**
 * Server-owned facts and one-off writes that belong to no larger domain:
 * platform config + chain registry, the blockchain report/permit seam, media
 * upload signatures, moderation preview, and content reports.
 */
import { apiRoutes } from '../routes'
import type {
  ChainRegistryEntry,
  ClientPingBody,
  ClientPingResponse,
  CloudinarySignature,
  CreateReportInput,
  ExchangeRates,
  ModerationPreviewBody,
  ModerationPreviewResponse,
  PermitPayloadBody,
  PermitPayloadResponse,
  PlatformConfig,
  UploadSignatureBody,
} from '../..'
import type { ApiRequest } from './types'
import { MODERATION_TIMEOUT_MS, TX_BUILD_TIMEOUT_MS } from './timeouts'

const { platform, blockchain, upload, moderation, reports } = apiRoutes

export function createPlatformApi(request: ApiRequest) {
  return {
    config: () => request<PlatformConfig>('GET', platform.config),
    exchangeRates: () => request<ExchangeRates>('GET', platform.exchangeRates),
    // CO5: enabled chains + assets (chain/asset picker source).
    chains: () => request<{ data: ChainRegistryEntry[] }>('GET', platform.chains),
  }
}

export function createBlockchainApi(request: ApiRequest) {
  return {
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
}

export function createUploadApi(request: ApiRequest) {
  return {
    signature: (body: UploadSignatureBody) =>
      request<CloudinarySignature>('POST', upload.signature, { body }),
  }
}

export function createModerationApi(request: ApiRequest) {
  return {
    preview: (body: ModerationPreviewBody) =>
      request<ModerationPreviewResponse>('POST', moderation.preview, {
        body,
        timeout: MODERATION_TIMEOUT_MS,
      }),
  }
}

export function createReportsApi(request: ApiRequest) {
  return {
    create: (body: CreateReportInput) => request<{ id: string }>('POST', reports.create, { body }),
  }
}
