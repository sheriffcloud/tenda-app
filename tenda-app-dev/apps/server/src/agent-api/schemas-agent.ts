/**
 * Agent API v1 component schemas (#19) — the write surface's request and
 * response shapes, closed like everything in ./schemas. The x402 terms are
 * documented field-for-field from relay.contract.ts so an agent can sign
 * them from the document alone; the registration answer is the auth
 * response's `user` row, closed over the users columns it actually carries.
 *
 * Every object is `closedFor<WireType>`: the compiler holds each schema to the
 * exact keys of the shared type it documents, so a field the type gains — or a
 * key mistyped here — fails the build, not a reader.
 */
import {
  type AgentRegisterBody,
  type AgentRegisterResponse,
  type AgentTaskBody,
  type AgentTaskCreated,
  type AgentTaskPaymentRequired,
  AMOUNT_RAW_PATTERN,
  type EvmAuthorizationTerms,
  type EvmCreateParamsWire,
  GIG_CATEGORIES,
  type LinkWalletBody,
  MAX_ACCEPT_WINDOW_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MAX_GIG_DESCRIPTION_LENGTH,
  MAX_GIG_TITLE_LENGTH,
  MIN_ACCEPT_WINDOW_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  NAME_MAX_LENGTH,
  PROOF_TYPES,
  type ReceiveAuthorizationTypedData,
  RELAY_PAYMENT_KINDS,
  type RelayTerms,
  type SolanaTransactionTerms,
  TENDA_RELAY_SCHEME,
  type User,
  X402_VERSION,
} from '@tenda/shared'
import { userRoleEnum, userStatusEnum } from '@tenda/shared/db/schema'
import { closedFor, nullable, ref, type SchemaObject, type V1ComponentName } from './schema-types'
import { COUNTRY_CODES, chainId, isoInstant, latitude, longitude, rawAmount, uuid } from './scalars'

const hexAddress: SchemaObject = { type: 'string', description: '0x-hex address (EVM) or base58 (Solana)' }

/** The wallet proof of /v1/auth/verify { method: "wallet" }: a message signed over a /v1/auth/nonce. */
const WALLET_PROOF: Readonly<Record<keyof LinkWalletBody, SchemaObject>> = {
  chain_id: chainId,
  address: hexAddress,
  message: { type: 'string', description: 'The auth message verbatim — Chain / URI / Nonce / Issued At lines; the signature is over these exact bytes' },
  signature: { type: 'string', description: 'The wallet signature over `message`' },
}

const agentRegisterBody = closedFor<AgentRegisterBody>(
  {
    ...WALLET_PROOF,
    name: { type: 'string', minLength: 1, maxLength: NAME_MAX_LENGTH, description: 'The agent\'s public display name' },
    country: { type: 'string', enum: COUNTRY_CODES },
  },
  ['chain_id', 'address', 'message', 'signature', 'name'],
  'Prove control of the agent\'s wallet and name it. Re-registering a wallet already linked to an agent signs it in (is_new: false).',
)

const agentAccount = closedFor<User>(
  {
    id: uuid,
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    bio: nullable({ type: 'string' }),
    avatar_url: nullable({ type: 'string' }),
    country: nullable({ type: 'string', enum: COUNTRY_CODES }),
    city: nullable({ type: 'string' }),
    latitude: nullable(latitude),
    longitude: nullable(longitude),
    role: { type: 'string', enum: userRoleEnum.enumValues },
    status: { type: 'string', enum: userStatusEnum.enumValues },
    is_seeker: { type: 'boolean' },
    is_agent: { type: 'boolean', const: true },
    review_score: nullable({ type: 'string' }),
    sponsored_tx_remaining: { type: 'integer', minimum: 0 },
    advanced_mode_enabled: { type: 'boolean' },
    announcements_read_at: nullable(isoInstant),
    last_active_at: nullable(isoInstant),
    created_at: isoInstant,
    updated_at: isoInstant,
  },
  ['id', 'first_name', 'last_name', 'bio', 'avatar_url', 'country', 'city', 'latitude', 'longitude', 'role', 'status', 'is_seeker', 'is_agent', 'review_score', 'sponsored_tx_remaining', 'advanced_mode_enabled', 'announcements_read_at', 'last_active_at', 'created_at', 'updated_at'],
  'The agent\'s own account row, as /v1/auth/verify returns it.',
)

const agentRegisterResponse = closedFor<AgentRegisterResponse>(
  { token: { type: 'string', description: 'Bearer JWT for every authenticated call' }, user: ref('AgentAccount'), is_new: { type: 'boolean' } },
  ['token', 'user', 'is_new'],
)

const proofParams = ref('ProofParams')

const agentTaskBody = closedFor<AgentTaskBody>(
  {
    creation_operation_id: { ...uuid, description: 'Idempotency key: the 402 → resend round trip must carry the SAME value, and does so land on the same draft' },
    chain_id: chainId,
    asset: { type: 'string', description: 'The chain\'s gig asset id (USDC), e.g. USDC_BASE' },
    amount_raw: rawAmount,
    accept_window_seconds: { type: 'integer', minimum: MIN_ACCEPT_WINDOW_SECONDS, maximum: MAX_ACCEPT_WINDOW_SECONDS, description: 'How long the listing stays open for a worker to accept, as a DURATION. The server derives the absolute on-chain deadline from it at the moment the funding transaction is built, so a draft that sits before it is funded is never stale. This IS one of the terms a replay compares: resending the same creation_operation_id with a different window is 409, exactly like a different amount, asset, duration, bond, counterparty or approval mode' },
    completion_duration_seconds: { type: 'integer', minimum: MIN_COMPLETION_DURATION_SECONDS, maximum: MAX_COMPLETION_DURATION_SECONDS },
    dispute_bond_raw: rawAmount,
    requires_approval: { type: 'boolean', description: 'Approval mode: workers apply, the agent assigns' },
    assigned_counterparty_id: { ...uuid, description: 'Direct invite: the one worker who may accept' },
    signer_address: { ...hexAddress, description: 'The agent\'s signing wallet when more than one is linked; absent = primary' },
    title: { type: 'string', minLength: 1, maxLength: MAX_GIG_TITLE_LENGTH },
    description: nullable({ type: 'string', maxLength: MAX_GIG_DESCRIPTION_LENGTH }),
    category: { type: 'string', enum: GIG_CATEGORIES },
    country: { type: 'string', enum: COUNTRY_CODES, description: 'Required for on-site gigs; omitted for remote' },
    remote: { type: 'boolean' },
    city: { type: 'string', description: 'Required for on-site gigs' },
    latitude,
    longitude,
    proof_requirements: { type: 'array', items: { type: 'string', enum: PROOF_TYPES } },
    proof_params: nullable(proofParams),
  },
  ['creation_operation_id', 'chain_id', 'asset', 'amount_raw', 'accept_window_seconds', 'completion_duration_seconds', 'title', 'category'],
  'The escrow terms (POST /v1/escrows minus kind and permit) plus the listing (POST /v1/gigs minus escrow_id), in one body.',
)

type TypedData = ReceiveAuthorizationTypedData
type TypedDataField = TypedData['types']['EIP712Domain'][number]
const typedDataField = closedFor<TypedDataField>({ name: { type: 'string' }, type: { type: 'string' } }, ['name', 'type'])
const uintText: SchemaObject = { type: 'string', pattern: AMOUNT_RAW_PATTERN.source, description: 'uint256 as a decimal string' }

const evmCreateParamsWire = closedFor<EvmCreateParamsWire>(
  {
    escrowId: { type: 'string' }, kind: { type: 'integer' }, asset: hexAddress, amount: uintText,
    assignedCounterparty: hexAddress, acceptDeadline: uintText, completionDuration: uintText, disputeBond: uintText,
    isSeeker: { type: 'boolean' }, requiresApproval: { type: 'boolean' }, unassignWindowSeconds: uintText,
  },
  ['escrowId', 'kind', 'asset', 'amount', 'assignedCounterparty', 'acceptDeadline', 'completionDuration', 'disputeBond', 'isSeeker', 'requiresApproval', 'unassignWindowSeconds'],
  'The contract\'s CreateParams the authorization nonce hashes — recompute keccak256(abi.encode(struct)) from exactly this.',
)

const receiveAuthorizationTypedData = closedFor<TypedData>(
  {
    types: closedFor<TypedData['types']>(
      { EIP712Domain: { type: 'array', items: typedDataField }, ReceiveWithAuthorization: { type: 'array', items: typedDataField } },
      ['EIP712Domain', 'ReceiveWithAuthorization'],
    ),
    primaryType: { type: 'string', const: 'ReceiveWithAuthorization' satisfies TypedData['primaryType'] },
    domain: closedFor<TypedData['domain']>(
      { name: { type: 'string' }, version: { type: 'string' }, chainId: { type: 'integer' }, verifyingContract: hexAddress },
      ['name', 'version', 'chainId', 'verifyingContract'],
    ),
    message: closedFor<TypedData['message']>(
      { from: hexAddress, to: hexAddress, value: uintText, validAfter: uintText, validBefore: uintText, nonce: { type: 'string', description: '0x-hex bytes32' } },
      ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'],
    ),
  },
  ['types', 'primaryType', 'domain', 'message'],
  'Sign VERBATIM with eth_signTypedData_v4; send the 65-byte signature and the message fields back as the X-PAYMENT payload.',
)

const evmAuthorizationTerms = closedFor<EvmAuthorizationTerms>(
  { kind: { type: 'string', const: RELAY_PAYMENT_KINDS[0] satisfies EvmAuthorizationTerms['kind'] }, creator: hexAddress, create_params: ref('EvmCreateParamsWire'), typed_data: ref('ReceiveAuthorizationTypedData') },
  ['kind', 'creator', 'create_params', 'typed_data'],
)
const solanaTransactionTerms = closedFor<SolanaTransactionTerms>(
  {
    kind: { type: 'string', const: RELAY_PAYMENT_KINDS[1] satisfies SolanaTransactionTerms['kind'] },
    creator: hexAddress,
    fee_payer: { type: 'string', description: 'The relayer, baked in as fee payer' },
    transaction: { type: 'string', description: 'base64 unsigned versioned transaction — sign this and nothing else' },
    recent_blockhash: { type: 'string' },
    last_valid_block_height: { type: 'integer' },
  },
  ['kind', 'creator', 'fee_payer', 'transaction', 'recent_blockhash', 'last_valid_block_height'],
)

const relayTerms = closedFor<RelayTerms>(
  {
    scheme: { type: 'string', const: TENDA_RELAY_SCHEME },
    network: chainId,
    asset: hexAddress,
    asset_id: { type: 'string' },
    amount_raw: rawAmount,
    pay_to: { type: 'string', description: 'The escrow contract / program that receives the funds' },
    escrow_id: uuid,
    max_timeout_seconds: { type: 'integer' },
    expires_at_unix: { type: 'integer' },
    payment: { oneOf: [ref('EvmAuthorizationTerms'), ref('SolanaTransactionTerms')] },
  },
  ['scheme', 'network', 'asset', 'asset_id', 'amount_raw', 'pay_to', 'escrow_id', 'max_timeout_seconds', 'expires_at_unix', 'payment'],
  'One x402 `accepts` entry: what to sign, by when, and what it funds.',
)

const agentTaskPaymentRequired = closedFor<AgentTaskPaymentRequired>(
  {
    x402Version: { type: 'integer', const: X402_VERSION },
    accepts: { type: 'array', items: ref('RelayTerms'), maxItems: 1 },
    error: { type: 'string' },
    task_id: { ...uuid, description: 'The task (= gig) id the terms fund; GET /v1/gigs/{id} with the bearer reads it' },
  },
  ['x402Version', 'accepts', 'error', 'task_id'],
  'The x402 envelope: resend the same body with X-PAYMENT = base64 { x402Version, scheme, network, payload }.',
)

const agentTaskCreated = closedFor<AgentTaskCreated>(
  {
    task_id: uuid,
    tx_ref: { type: 'string', description: 'The relayed create\'s chain reference' },
    status: { type: 'string', const: 'draft' satisfies AgentTaskCreated['status'], description: 'Draft until the chain confirms; then open and public' },
    recorded: { type: 'boolean' },
    enqueued: { type: 'boolean' },
  },
  ['task_id', 'tx_ref', 'status', 'recorded', 'enqueued'],
)

export const AGENT_API_V1_SCHEMAS: Readonly<Record<V1ComponentName, SchemaObject>> = {
  AgentRegisterBody: agentRegisterBody,
  AgentAccount: agentAccount,
  AgentRegisterResponse: agentRegisterResponse,
  AgentTaskBody: agentTaskBody,
  EvmCreateParamsWire: evmCreateParamsWire,
  ReceiveAuthorizationTypedData: receiveAuthorizationTypedData,
  EvmAuthorizationTerms: evmAuthorizationTerms,
  SolanaTransactionTerms: solanaTransactionTerms,
  RelayTerms: relayTerms,
  AgentTaskPaymentRequired: agentTaskPaymentRequired,
  AgentTaskCreated: agentTaskCreated,
}
