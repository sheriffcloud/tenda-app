/**
 * Wire shapes of the relayed-funding flow: POST /v1/escrows/:id/fund answers
 * 402 with `RelayPaymentRequired` until the request carries an `X-PAYMENT`
 * header holding a `RelayPaymentPayload`, then relays and answers 202 with
 * `FundEscrowResponse` plus an `X-PAYMENT-RESPONSE` header holding
 * `RelaySettlementResponse`. The constants live in constants/relay.ts.
 */
import type { RelayPaymentKind, TENDA_RELAY_SCHEME, X402_VERSION } from '../../constants/relay'
import type { ClientPingResponse } from './escrows.contract'

/**
 * The contract's `CreateParams` struct as the terms show it, every field a
 * decimal or hex STRING (uint256 survives JSON). An agent can recompute the
 * authorization nonce — keccak256(abi.encode(struct)) — from exactly this.
 */
export interface EvmCreateParamsWire {
  escrowId: string
  kind: number
  asset: string
  amount: string
  assignedCounterparty: string
  acceptDeadline: string
  completionDuration: string
  disputeBond: string
  isSeeker: boolean
  requiresApproval: boolean
  unassignWindowSeconds: string
}

/**
 * EIP-712 typed data for an EIP-3009 `ReceiveWithAuthorization`, built
 * entirely server-side like `PermitTypedData`: the agent signs it verbatim
 * (eth_signTypedData_v4) and never hashes a domain itself.
 */
export interface ReceiveAuthorizationTypedData {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>
    ReceiveWithAuthorization: Array<{ name: string; type: string }>
  }
  primaryType: 'ReceiveWithAuthorization'
  domain: { name: string; version: string; chainId: number; verifyingContract: string }
  /** uint256 fields as decimal strings; `nonce` is the 0x-hex bytes32. */
  message: {
    from: string
    to: string
    value: string
    validAfter: string
    validBefore: string
    nonce: string
  }
}

export interface EvmAuthorizationTerms {
  kind: Extract<RelayPaymentKind, 'eip155-authorization'>
  /** The signer — the caller's linked wallet the escrow will name as creator. */
  creator: string
  create_params: EvmCreateParamsWire
  typed_data: ReceiveAuthorizationTypedData
}

export interface SolanaTransactionTerms {
  kind: Extract<RelayPaymentKind, 'solana-transaction'>
  creator: string
  /** The relayer's public key, baked in as the transaction's fee payer. */
  fee_payer: string
  /** base64 unsigned versioned transaction — the agent signs THIS and nothing else. */
  transaction: string
  recent_blockhash: string
  last_valid_block_height: number
}

/** One entry of the 402 body's `accepts` list. */
export interface RelayTerms {
  scheme: typeof TENDA_RELAY_SCHEME
  /** CAIP-2 chain id. */
  network: string
  /** Token address (EVM) or mint (Solana) the amount is denominated in. */
  asset: string
  asset_id: string
  amount_raw: string
  /** The escrow contract / program that receives the funds. */
  pay_to: string
  escrow_id: string
  /** Seconds the terms stay signable from when they were issued. */
  max_timeout_seconds: number
  expires_at_unix: number
  payment: EvmAuthorizationTerms | SolanaTransactionTerms
}

export interface RelayPaymentRequired {
  x402Version: typeof X402_VERSION
  accepts: RelayTerms[]
  error: string
}

/** x402's EVM `exact` payload shape, verbatim — the fields an EIP-3009 signature covers. */
export interface EvmAuthorizationPayment {
  /** 65-byte 0x-hex signature over the typed data the terms carried. */
  signature: string
  authorization: {
    from: string
    to: string
    value: string
    validAfter: string
    validBefore: string
    nonce: string
  }
}

/** x402's SVM `exact` payload shape, verbatim: the PARTIALLY signed transaction. */
export interface SolanaTransactionPayment {
  /** base64 versioned transaction carrying the creator's signature; the fee payer's slot is empty. */
  transaction: string
}

/**
 * The decoded `X-PAYMENT` header. `scheme` is typed open because a decoded
 * header is whatever the client sent — the server refuses anything but
 * TENDA_RELAY_SCHEME with RELAY_REJECTED rather than pretending at the type.
 */
export interface RelayPaymentPayload {
  x402Version: typeof X402_VERSION
  scheme: string
  network: string
  payload: EvmAuthorizationPayment | SolanaTransactionPayment
}

/** The decoded `X-PAYMENT-RESPONSE` header — x402's settlement response fields. */
export interface RelaySettlementResponse {
  success: true
  /** The relayed transaction's chain reference (tx hash / signature). */
  transaction: string
  network: string
  /** The escrow's creator — whose funds moved. */
  payer: string
}

/** 202 body: the client-ping result for the relayed create, plus its reference. */
export interface FundEscrowResponse extends ClientPingResponse {
  tx_ref: string
}
