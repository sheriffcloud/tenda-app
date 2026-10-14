/**
 * EVM GasSeedSender (#53a, reworked at #58): transfers the one-time native seed
 * from the hot wallet (`CHAIN_<ID>_GAS_SEED_KEY`) to a newly linked wallet.
 *
 * A leaf beside its Solana twin: the claim jobs orchestrate through the
 * `GasSeedSender` interface and never touch viem, so the seed can be removed
 * without the chain adapters noticing.
 *
 * WHAT #58 CHANGED, and why this file got simpler rather than more clever. It
 * used to broadcast and wait for the receipt inside ONE call, so a wait that
 * timed out — viem gives up after 180s — had to be interpreted, and every
 * interpretation was wrong somewhere: reading it as failure released a slot
 * whose money had already left and paid the user twice, reading it as success
 * stranded one who was never paid. There is nothing to interpret now. Signing,
 * broadcasting and confirming are three separate steps with the transaction's
 * hash written to the database between the first and the second, and a
 * confirmation that has not happened yet is simply `pending`.
 *
 * THE EVM-SPECIFIC RULE, stated here because its Solana twin has the opposite
 * one: an EVM transaction is pinned at a nonce and NEVER EXPIRES. It can sit in
 * mempools and be mined minutes or hours later. So "no receipt" means NOT YET,
 * never NEVER, however long it has been — `submitted_at` is deliberately unused
 * below. Only a receipt that says `reverted` is evidence of failure.
 *
 * Concurrency: two seeds racing on one hot wallet can collide on a nonce, and
 * the loser's broadcast is refused by the node. That throw is the RIGHT outcome
 * — the claim job releases the slot on a failure to broadcast, so the user is
 * seeded by the next attempt rather than recorded as seeded with nothing.
 */
import { getAddress, keccak256, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainById } from '@tenda/shared'
import type { GasSeedSender, GasSeedTransferStatus } from '../claim/grants'
import type { GasSeedFunder } from './index'
import { evmHotWallet } from '@server/chains/evm/sender/hot-wallet'

/** The two states a receipt that EXISTS can be in. */
export type EvmReceiptStatus = 'success' | 'reverted'

/** A receipt the chain holds, reduced to what the seed's decision needs. */
export interface EvmSeedReceipt {
  status: EvmReceiptStatus
  /** Which block mined it, for measuring depth against the current head. */
  block_number: bigint
}

/**
 * The three chain operations the seed needs, as a port.
 *
 * A seam rather than direct viem calls, for the reason
 * `solanaRelayerFromConnection` has one: the branches that decide whether a user
 * keeps their money are otherwise reachable only from a live chain. A plain
 * value transfer to an EOA cannot revert, so no anvil scenario produces the
 * `reverted` receipt — and an unreachable branch is an untested branch.
 */
export interface EvmGasSeedPort {
  /** Sign as the hot wallet, WITHOUT broadcasting. Returns the hash and the bytes. */
  sign(args: { to: `0x${string}`; value: bigint }): Promise<{ hash: Hex; raw: Hex }>
  /** Put previously signed bytes on the chain. Does not wait for a receipt. */
  send(raw: Hex): Promise<void>
  /** The receipt the chain holds for `hash` RIGHT NOW, or null when it has none. */
  receipt(hash: Hex): Promise<EvmSeedReceipt | null>
  /** The chain's current head, for measuring how deep a receipt is buried. */
  head(): Promise<bigint>
}

/**
 * The hot wallet's public address, for `chains.gas_seed_wallet_address`. Used
 * by the seeder to record the funder from the SAME secret this sender signs
 * with, so the recorded funder can never drift from the wallet that pays.
 * Local (secp256k1) — it contacts nothing, which is what lets the pure seed-row
 * builder call it. Throws on a malformed key (fail-fast at seed time), like
 * `gasSeedAddressFromSecret` on Solana.
 */
export function evmGasSeedAddressFromKey(private_key: `0x${string}`): string {
  return privateKeyToAccount(private_key).address
}

/**
 * How deep the seed's receipt must be buried before it counts: the chain's OWN
 * reorg margin, the same one escrow receipts are verified at.
 *
 * Named and exported so it can be asserted against the manifest. A wrong value
 * is a real regression rather than a hypothetical: hardcoding 1 would accept a
 * receipt at depth 1 on Celo, which asks for 3, and a seed marked delivered
 * from a block that then reorgs out is a user permanently recorded as paid.
 */
export function gasSeedConfirmations(chain_id: string): number {
  return chainById(chain_id).minConfirmations
}

/**
 * How many blocks sit on top of `block_number`, counting its own.
 *
 * Extracted because it is the arithmetic everyone gets wrong by one. A receipt
 * in the head block has depth 1, not 0 — it has been confirmed once, by the
 * block containing it — which is what makes `minConfirmations: 1` mean "mined"
 * rather than "mined and then one more". Off by one in the other direction and
 * a chain asking for 3 would settle for 2.
 */
export function receiptDepth(block_number: bigint, head: bigint): bigint {
  const depth = head - block_number + 1n
  return depth < 0n ? 0n : depth
}

/**
 * What the chain's answer about one transfer MEANS.
 *
 * Pure, and separated from the port so all FOUR INPUT CASES are reachable
 * without a node — they collapse to three outcomes, and two of the four are
 * ones a real chain will not produce on demand: a reverted value transfer, and
 * a receipt that has not yet reached its depth on a chain that mines instantly.
 */
export function classifyEvmReceipt(
  receipt: EvmSeedReceipt | null,
  head: bigint,
  confirmations: number,
): GasSeedTransferStatus {
  // No receipt is NOT failure on EVM — the transaction is nonce-pinned and can
  // still be mined. See the file header.
  if (receipt === null) return 'pending'
  if (receipt.status === 'reverted') return 'failed'
  // Mined, but not yet buried deep enough to survive a reorg on this chain.
  // Reporting `delivered` here would let a reorg strand a user who is already
  // recorded as paid, and the primary key makes that permanent.
  return receiptDepth(receipt.block_number, head) >= BigInt(confirmations) ? 'delivered' : 'pending'
}

export function evmGasSeedSenderFromPort(port: EvmGasSeedPort, chain_id: string): GasSeedSender {
  const confirmations = gasSeedConfirmations(chain_id)
  return {
    async sign({ to_address, amount_raw }) {
      // getAddress rather than a cast: the row comes from `user_wallets`, and a
      // malformed address should fail HERE, named, rather than inside viem's
      // encoder several frames down.
      //
      // Lower-cased FIRST because EIP-55 casing is cosmetic on eip155 — the
      // rule chains/contracts/normalize.ts states — and `user_wallets` stores
      // whatever spelling a client sent. Passing a stored mixed-case address
      // straight to getAddress would make a cosmetic difference a checksum
      // FAILURE, blocking a seed to a wallet that is perfectly valid.
      const to = getAddress(to_address.toLowerCase())
      const { hash, raw } = await port.sign({ to, value: BigInt(amount_raw) })
      return { tx_ref: hash, broadcast: () => port.send(raw) }
    },
    // `submitted_at` is ignored, deliberately and permanently. See the header:
    // an EVM transaction does not expire, so its age carries no information
    // about whether it can still land.
    async checkStatus({ tx_ref }) {
      // The one cast in this file, and what makes it safe is the fold below it
      // rather than any guarantee about the string. `tx_ref` comes from a
      // database column, so unlike the key casts in ./index.ts — which a
      // boot-time validator backs — nothing here proves it is 0x-hex. It does
      // not need to: `port.receipt` turns ANY throw into null, so a malformed
      // reference reads as `pending`, and the confirm job's own window
      // eventually files it as `unresolved` for a person. A row nobody can
      // interpret SHOULD end up in front of a human.
      const hash = tx_ref as Hex
      const [receipt, head] = await Promise.all([port.receipt(hash), port.head()])
      return classifyEvmReceipt(receipt, head, confirmations)
    },
  }
}

/**
 * The paying wallet, as the claim surface needs it: who it is, and whether it
 * can still cover a grant.
 *
 * Separate from `GasSeedSender` rather than bolted onto it (interface
 * segregation, and it keeps #53a's fakes valid): the jobs only ever send, and
 * the availability read only ever looks. A sender forced to answer `balance()`
 * would make every test double implement an RPC call it never uses.
 */
export function evmGasSeedFunder(args: {
  rpc_url: string
  /**
   * Secondary endpoint. Handed straight to `evmHotWallet`, which builds the
   * failover transport — so the reader AND the wallet client both get it, and
   * a broadcast survives one provider stalling. Safe here because the nonce
   * pins the transaction; Solana's sender is safe for the same reason (one
   * signature, the same bytes re-sent).
   *
   * A required key, like every other builder of an EVM hot wallet: optional is
   * how the relayer beside this one ended up with no failover at all.
   */
  rpc_url_fallback: string | undefined
  chain_id: string
  private_key: `0x${string}`
}): GasSeedFunder {
  const { reader } = evmHotWallet(args)
  const address = evmGasSeedAddressFromKey(args.private_key)
  return {
    address,
    // `getAddress` on a value privateKeyToAccount already checksummed would be
    // redundant; viem returns the canonical form from the key itself.
    balance: () => reader.getBalance({ address: address as `0x${string}` }),
  }
}

/**
 * The REAL port: viem against a live chain.
 *
 * Split out of `evmGasSeedSender` so the anvil suite can drive `receipt()` and
 * the sign/send split against an actual node. That matters more than it looks —
 * the branch where viem throws TransactionReceiptNotFoundError and this folds it
 * to null is the one the whole design turns on, and against a fake port it would
 * be the test's own lambda under assertion rather than this code.
 */
export function evmGasSeedPort(args: {
  rpc_url: string
  /** Secondary endpoint; see `evmGasSeedFunder` for why this key is required. */
  rpc_url_fallback: string | undefined
  /** CAIP-2 id of a manifest EVM chain, e.g. `'eip155:16661'`. */
  chain_id: string
  /** 0x-hex secp256k1 private key of the seed hot wallet. */
  private_key: `0x${string}`
}): EvmGasSeedPort {
  const { reader, wallet } = evmHotWallet(args)
  return {
    async sign({ to, value }) {
      // prepare + sign + hash LOCALLY, so the reference exists before anything
      // can reach the chain. `sendTransaction` would have done all three and
      // broadcast in the same call, leaving no moment at which the hash is
      // known and the money still cannot have moved.
      const request = await wallet.prepareTransactionRequest({ to, value })
      const raw = await wallet.signTransaction(request)
      // The transaction hash IS the keccak of its signed bytes — the same value
      // the node will report — so this needs no round trip and cannot disagree
      // with what lands.
      return { hash: keccak256(raw), raw }
    },
    async send(raw) {
      await wallet.sendRawTransaction({ serializedTransaction: raw })
    },
    async receipt(hash) {
      try {
        const r = await reader.getTransactionReceipt({ hash })
        return { status: r.status, block_number: r.blockNumber }
      } catch {
        // viem throws TransactionReceiptNotFoundError for a hash the node holds
        // no receipt for. That means STILL PENDING, not "never happened". A
        // transport error lands here too, and both collapse to null on purpose:
        // neither is evidence the transfer failed, and the confirm job retries.
        return null
      }
    },
    head: () => reader.getBlockNumber(),
  }
}

/**
 * The chain-facing sender: the real port, with the outcome rules of
 * `evmGasSeedSenderFromPort` over it.
 */
export function evmGasSeedSender(args: Parameters<typeof evmGasSeedPort>[0]): GasSeedSender {
  return evmGasSeedSenderFromPort(evmGasSeedPort(args), args.chain_id)
}
