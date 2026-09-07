/**
 * Licensed-provider HTTP adapter, one generic implementation serving both
 * Yellow Card and Onramp.money entries.
 *
 * IMPORTANT (#61): both providers gate their partner APIs behind merchant
 * onboarding; exact endpoint paths/field names are confirmed there. The
 * wire mapping is therefore isolated in ONE place (`LicensedProviderSpec`)
 * so onboarding finalizes a constant, not code. Until the matching env
 * credentials exist the provider is simply absent from the registry and
 * routing falls through to p2p_internal, the platform never breaks on a
 * missing key.
 *
 * Request signing: HMAC-SHA256 over the JSON body with the API secret in
 * an `X-Signature` header + `X-Api-Key`, the prevailing pattern for both
 * vendors; revalidated at onboarding.
 */

import { createHmac } from 'node:crypto'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import type {
  FiatProvider,
  ProviderCapabilities,
  ProviderIntentStatus,
  ProviderQuote,
  QuoteRequest,
  InitiateResult,
  PaymentInstruction,
  DepositInstruction,
} from '../types'

export interface LicensedProviderSpec {
  id: string
  base_url: string
  capabilities: ProviderCapabilities
  paths: {
    quote: string
    initiate: string
    /** `{ref}` is substituted with the provider_ref. */
    status: string
  }
}

export interface LicensedProviderCreds {
  api_key: string
  api_secret: string
}

/** Minimal HTTP seam, tests inject a fake; production uses fetch. */
export interface ProviderHttp {
  post(url: string, body: unknown, headers: Record<string, string>): Promise<unknown>
  get(url: string, headers: Record<string, string>): Promise<unknown>
}

export function fetchProviderHttp(timeoutMs = 15_000): ProviderHttp {
  async function run(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      throw new AppError(
        502,
        ErrorCode.PROVIDER_UNAVAILABLE,
        `provider responded ${res.status}`,
      )
    }
    return res.json()
  }
  return {
    post: (url, body, headers) =>
      run(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    get: (url, headers) => run(url, { method: 'GET', headers }),
  }
}

// ---------- response narrowing ------------------------------------------------

function field(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null && key in obj
    ? (obj as Record<string, unknown>)[key]
    : undefined
}

function requireString(obj: unknown, key: string): string {
  const v = field(obj, key)
  if (typeof v !== 'string' || v.length === 0) {
    throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, `provider response missing '${key}'`)
  }
  return v
}

function requireNumber(obj: unknown, key: string): number {
  const v = field(obj, key)
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, `provider response missing '${key}'`)
  }
  return v
}

function parseInstruction(obj: unknown): PaymentInstruction | DepositInstruction {
  const kind = field(obj, 'kind')
  switch (kind) {
    case 'bank_transfer':
      return {
        kind: 'bank_transfer',
        bank_name: requireString(obj, 'bank_name'),
        account_number: requireString(obj, 'account_number'),
        account_name: requireString(obj, 'account_name'),
        narration: requireString(obj, 'narration'),
      }
    case 'redirect':
      return { kind: 'redirect', url: requireString(obj, 'url') }
    case 'ussd':
      return { kind: 'ussd', code: requireString(obj, 'code') }
    case 'deposit': {
      const memo = field(obj, 'memo')
      return {
        deposit_address: requireString(obj, 'deposit_address'),
        memo: typeof memo === 'string' ? memo : null,
      }
    }
    default:
      throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, 'provider returned unknown instruction kind')
  }
}

const STATUS_MAP: Record<string, ProviderIntentStatus> = {
  pending: 'pending',
  processing: 'pending',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
  not_found: 'not_found',
}

// ---------- provider ------------------------------------------------------------

export function licensedHttpProvider(
  spec: LicensedProviderSpec,
  creds: LicensedProviderCreds,
  http: ProviderHttp,
): FiatProvider {
  function headers(body: unknown): Record<string, string> {
    const payload = body === undefined ? '' : JSON.stringify(body)
    const signature = createHmac('sha256', creds.api_secret).update(payload).digest('hex')
    return { 'X-Api-Key': creds.api_key, 'X-Signature': signature }
  }

  return {
    id: spec.id,
    capabilities: spec.capabilities,

    async quote(req: QuoteRequest): Promise<ProviderQuote> {
      const body = {
        direction: req.direction,
        fiat_currency: req.fiat_currency,
        fiat_amount: req.fiat_amount,
        asset: req.asset,
        asset_amount_raw: req.asset_amount_raw,
        country: req.country,
      }
      const res = await http.post(`${spec.base_url}${spec.paths.quote}`, body, headers(body))
      const kyc_url = field(res, 'kyc_url')
      return {
        quote_ref: requireString(res, 'quote_ref'),
        rate: requireNumber(res, 'rate'),
        fee_amount: requireNumber(res, 'fee_amount'),
        fiat_amount: requireNumber(res, 'fiat_amount'),
        asset_amount_raw: requireString(res, 'asset_amount_raw'),
        kyc_required: field(res, 'kyc_required') === true,
        kyc_url: typeof kyc_url === 'string' ? kyc_url : null,
      }
    },

    async initiate(input): Promise<InitiateResult> {
      const body = {
        quote_ref: input.quote_ref,
        direction: input.direction,
        wallet_address: input.wallet_address,
        bank_account: input.bank_account ?? null,
      }
      const res = await http.post(`${spec.base_url}${spec.paths.initiate}`, body, headers(body))
      const kyc_url = field(res, 'kyc_url')
      return {
        provider_ref: requireString(res, 'provider_ref'),
        instruction: parseInstruction(field(res, 'instruction')),
        kyc_url: typeof kyc_url === 'string' ? kyc_url : null,
      }
    },

    async status(provider_ref): Promise<ProviderIntentStatus> {
      const url = `${spec.base_url}${spec.paths.status.replace('{ref}', encodeURIComponent(provider_ref))}`
      const res = await http.get(url, headers(undefined))
      const raw = field(res, 'status')
      return (typeof raw === 'string' ? STATUS_MAP[raw] : undefined) ?? 'pending'
    },
  }
}
