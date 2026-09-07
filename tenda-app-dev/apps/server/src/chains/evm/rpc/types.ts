/**
 * Data shapes at the EVM RPC boundary: what a receipt, a log, an escrow record
 * and an EIP-2612 token look like once decoded.
 *
 * Split from the implementation (300-line ceiling) because these are the
 * adapter's vocabulary — verify.ts, index.ts and the test fakes all speak them
 * without needing the viem client machinery next door.
 */

export interface EvmReceiptLog {
  address: string
  data: `0x${string}`
  topics: `0x${string}`[]
}

export interface EvmReceipt {
  status: 'success' | 'reverted'
  block_number: bigint
  logs: EvmReceiptLog[]
}

/**
 * On-chain `escrows(bytes16)` tuple, field order matches the Solidity
 * struct exactly (the public mapping getter flattens it).
 */
export interface EvmEscrowTuple {
  escrow_id: `0x${string}`
  kind: number
  asset: `0x${string}`
  amount: bigint
  creator: `0x${string}`
  counterparty: `0x${string}`
  assigned_counterparty: `0x${string}`
  status: number
  accept_deadline: bigint
  completion_duration: bigint
  completion_deadline: bigint
  approval_deadline: bigint
  dispute_bond: bigint
  is_seeker: boolean
  raised_by: `0x${string}`
  requires_approval: boolean
  unassign_window_seconds: bigint
}

/**
 * The `getEscrow` return struct, field-for-field as Solidity declares it
 * (camelCase). Mapped into the snake_case `EvmEscrowTuple` the adapter
 * consumes; keeping the two shapes distinct is what makes the mapping
 * checkable rather than positional.
 */
export interface EvmEscrowStruct {
  escrowId: `0x${string}`
  kind: number
  asset: `0x${string}`
  amount: bigint
  creator: `0x${string}`
  counterparty: `0x${string}`
  assignedCounterparty: `0x${string}`
  status: number
  acceptDeadline: bigint
  completionDuration: bigint
  completionDeadline: bigint
  approvalDeadline: bigint
  disputeBond: bigint
  isSeeker: boolean
  raisedBy: `0x${string}`
  requiresApproval: boolean
  unassignWindowSeconds: bigint
}

/** Live token facts an EIP-2612 permit payload needs (read per request). */
export interface EvmPermitFacts {
  name: string
  nonce: bigint
  domain_separator: `0x${string}`
}

/** A mined log's position, all the polling listener needs to enqueue it. */
export interface EvmLogRef {
  tx_hash: `0x${string}`
  block_number: bigint
}

export interface EvmRpc {
  /** Null = transaction unknown to the node (not yet mined / dropped). */
  getTransactionReceipt(hash: `0x${string}`): Promise<EvmReceipt | null>
  getBlockNumber(): Promise<bigint>
  /**
   * Every mined log the contract emitted in [from_block, to_block], ascending
   * block order. Reverted txs emit no logs, so only real state changes appear.
   */
  /**
   * Log references from ANY of `contracts` in the block range.
   *
   * Plural because a chain that has redeployed still has live escrows funded by
   * the superseded contract, and a listener watching only the current address
   * stops seeing their events entirely (open_issues #89). viem takes an address
   * ARRAY natively, so this is the same single `eth_getLogs` over the same range
   * — the provider's block cap bounds the RANGE, not the number of addresses, so
   * watching one contract too many costs nothing while watching one too few
   * diverges silently.
   */
  getLogRefs(
    contracts: readonly `0x${string}`[],
    from_block: bigint,
    to_block: bigint,
  ): Promise<EvmLogRef[]>
  /** Null = escrow id never created (zero creator sentinel). */
  readEscrow(escrow_contract: `0x${string}`, escrow_id: `0x${string}`): Promise<EvmEscrowTuple | null>
  /** name() + nonces(owner) + DOMAIN_SEPARATOR() off an EIP-2612 token. */
  readPermitFacts(token: `0x${string}`, owner: `0x${string}`): Promise<EvmPermitFacts>
}
