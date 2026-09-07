import type { Endpoint } from '../endpoint'
import type { ClientPingBody, ClientPingResponse } from './escrows.contract'

/**
 * EIP-712 typed data for an EIP-2612 permit, built ENTIRELY server-side
 * (token name/nonce read live over the server's RPC; domain version from the
 * manifest; domain recomputation checked against the token's on-chain
 * DOMAIN_SEPARATOR so a token rename/upgrade can never yield an unsignable
 * payload). The client passes it verbatim to eth_signTypedData_v4 — it never
 * constructs or hashes domains itself.
 */
export interface PermitTypedData {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>
    Permit: Array<{ name: string; type: string }>
  }
  primaryType: 'Permit'
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: string
  }
  /** uint256 fields as decimal strings (JSON-safe; wallets accept them). */
  message: {
    owner: string
    spender: string
    value: string
    nonce: string
    deadline: string
  }
}

export interface PermitPayloadBody {
  /** CAIP-2 chain id, e.g. 'eip155:84532'. */
  chain_id: string
  /** Asset registry id flagged `supports_permit`, e.g. 'USDC_BASE'. */
  asset: string
  /** Base-unit amount the permit must cover (escrow amount or dispute bond). */
  value_raw: string
  /**
   * The EVM account that will SIGN the permit and SEND the follow-up tx —
   * only the client knows which (live session address vs linked wallet).
   * The permit's `owner` must equal the eventual `msg.sender` or the
   * contract-side transferFrom fails. The server verifies it is one of the
   * caller's verified linked eip155 wallets before building the payload.
   */
  owner: string
}

export interface PermitPayloadResponse {
  typed_data: PermitTypedData
  /** Echoes for the follow-up create/dispute `permit` body. */
  value_raw: string
  deadline_unix: number
}

export interface BlockchainContract {
  /** v2 client-ping (#62): report a broadcast tx for async verification. */
  clientPing: Endpoint<'POST', undefined, ClientPingBody, undefined, ClientPingResponse>
  /** EIP-2612: server-built typed data for eth_signTypedData_v4 (authed). */
  permitPayload: Endpoint<'POST', undefined, PermitPayloadBody, undefined, PermitPayloadResponse>
}
