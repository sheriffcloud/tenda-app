/**
 * UnsignedTx dispatcher (stage-3 § mobile wallet façade): one entry point
 * that routes a server-built unsigned transaction to the right transport
 * and returns the chain's tx_ref for the client-ping.
 *
 *  - solana-tx   → MWA sign + app-side broadcast (existing Stage-0 path)
 *  - evm-tx      → WalletConnect (Reown) eth_sendTransaction over the connected
 *                  session; feeCurrency passes through for CELO
 *  - evm-userop  → BLOCKED on #47: signing a sponsored UserOperation needs
 *                  the bundler endpoint (Coinbase) to resolve nonce/gas and
 *                  accept eth_sendUserOperation. The server only emits this
 *                  kind once the paymaster env exists, so the typed error
 *                  below is unreachable until then, and loud if reached.
 */

import { VersionedTransaction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import type { ChainNamespace, EscrowTxType, UnsignedTx } from '@tenda/shared'
import {
  BOUND_WALLET_REFUSAL,
  ensureAllowance,
  findChain,
  orderedSignerAddresses,
  pickWalletAddress,
  sameWalletAddress,
  WalletError,
} from '@tenda/shared'
import { signAndSendStored } from '@/wallet/adapters/solana-mwa'
import { sendEvmTransaction } from '@/wallet/adapters/walletconnect'
import { ensureEvmSession } from '@/wallet/ensure-session'
import { signerSessionAddress } from '@/wallet/signer-slot'
import { useAuthStore } from '@/stores/auth.store'
import { useEscrowStore } from '@/stores/escrow.store'

export class UnsupportedUnsignedTxError extends Error {
  constructor(kind: string, detail: string) {
    super(`cannot sign '${kind}': ${detail}`)
    this.name = 'UnsupportedUnsignedTxError'
  }
}

/**
 * The account this device signs from on a namespace. `wallets[]` is the source
 * of trust: the session address is honoured only while it is still a verified
 * linked wallet, otherwise the primary (or first) verified linked wallet on
 * that namespace wins.
 *
 * Where that session address COMES from is `signer-slot`'s job — one module,
 * shared with the signer preview, so a new chain family adds one entry there
 * rather than another bespoke `resolveXFrom` here.
 */
export function resolveSignerFor(ns: ChainNamespace): string | null {
  return pickWalletAddress(ns, sessionAddressFor(ns), useAuthStore.getState().wallets)
}

/** The signer-resolution input for a namespace — live session, else the store
 *  slot. ONE module with the preview (see signer-slot), so the wallet named on
 *  screen and the wallet declared to the server cannot disagree. */
function sessionAddressFor(ns: ChainNamespace): string | null {
  return signerSessionAddress(useAuthStore.getState(), ns)
}

/**
 * EVERY wallet that could sign on this chain, most-likely-signer first — the
 * candidate set a balance check must reason over, since the signing wallet
 * isn't fixed until the wallet app opens. Namespace comes from the manifest
 * (never a string split on the id), so an unknown id yields [] rather than a
 * guess.
 */
export function resolveSignersForChain(chainId: string): string[] {
  const ns = findChain(chainId)?.namespace
  if (ns === undefined) return []
  return orderedSignerAddresses(ns, sessionAddressFor(ns), useAuthStore.getState().wallets)
}

/**
 * The EVM account this device signs/sends from, the SINGLE resolution both
 * dispatch and the permit flow use, so the permit's `owner` can never diverge
 * from the eventual `msg.sender`.
 */
export function resolveEvmFrom(): string | null {
  return resolveSignerFor('eip155')
}

/**
 * The wallet this client DECLARES it will sign with, on a build whose signer
 * is not yet chain-bound (create, publish a draft, accept a public escrow,
 * raise a dispute). The server bakes it — so leaving it out is not neutral,
 * it hands the choice to the primary-wallet default while the user signs with
 * whatever wallet is actually connected.
 *
 * `undefined` for an unknown chain or with nothing linked: the server then
 * behaves exactly as it did before the field existed.
 */
export function declaredSignerFor(chainId: string): string | undefined {
  const ns = findChain(chainId)?.namespace
  if (ns === undefined) return undefined
  return resolveSignerFor(ns) ?? undefined
}

/**
 * Make that declaration TRUE before it is made.
 *
 * On EVM the signer slot (`evmAddress`) is session-scoped and empty after a
 * restart, so declaring first would name the PRIMARY and then sign with
 * whichever wallet the user connects a moment later — precisely the mismatch
 * the field exists to prevent. `ensureEvmSession` connects on demand and syncs
 * the slot, and is idempotent once a session is live (the permit flow already
 * leans on that).
 *
 * Solana needs nothing: its slot is persisted, and MWA owns its own session.
 */
export async function settleSignerFor(chainId: string): Promise<void> {
  if (findChain(chainId)?.namespace === 'eip155') await ensureEvmSession()
}

/** Sign + broadcast a server-built unsigned tx. Returns the tx_ref. */
export async function signAndSendUnsignedTx(
  unsigned: UnsignedTx,
  chain_id?: string,
  onSigned?: () => void,
): Promise<string> {
  switch (unsigned.kind) {
    case 'solana-tx': {
      // The MWA adapter owns its session token (AsyncStorage), single source
      // of truth, no auth-store round-trip.
      const tx = VersionedTransaction.deserialize(Buffer.from(unsigned.tx_base64, 'base64'))
      return signAndSendStored(tx, onSigned)
    }
    case 'evm-tx': {
      // Guarantee a live, linked session first (connect-on-demand) AND sync the
      // signer slot to it, so `resolveEvmFrom` below signs from the connected
      // wallet instead of dead-ending when the session isn't live.
      await ensureEvmSession()
      const from = resolveEvmFrom()
      if (from === null) {
        throw new Error('no EVM wallet connected, link one in Settings → Wallets first')
      }
      // The chain has already BOUND this transition to one wallet, and the
      // connected one is a different one. Broadcasting anyway sends a tx the
      // contract's party check reverts — gas spent, and a failure whose
      // reason the user never sees. Refuse here instead, NAMING the wallet the
      // escrow needs, which is the same sentence the signer row's Connect
      // affordance acts on. (No auto-switch: mobile's transports are
      // per-wallet-app, so changing signer needs the picker, which is UI.)
      if (
        unsigned.signer_address !== undefined &&
        !sameWalletAddress('eip155', from, unsigned.signer_address)
      ) {
        throw new WalletError(
          'no_wallet',
          BOUND_WALLET_REFUSAL.wrongWallet(unsigned.signer_address),
        )
      }
      // The server's approval hint: this ERC-20 call transferFroms, so the
      // allowance must cover it BEFORE broadcast (permit-built calls carry
      // no hint, their allowance rides the tx). Ordering lives HERE so
      // every flow (create, publish-draft, dispute) inherits it.
      if (unsigned.approval !== undefined) {
        if (chain_id === undefined) {
          // Silently skipping would broadcast a tx guaranteed to revert.
          throw new UnsupportedUnsignedTxError(
            'evm-tx',
            'the approval hint needs the chain_id to read/set the allowance, pass it (signSendAndReport always does)',
          )
        }
        await ensureAllowance({
          chainId: chain_id,
          token: unsigned.approval.token,
          spender: unsigned.approval.spender,
          amountRaw: unsigned.approval.amount_raw,
          owner: from,
          sendTx: sendEvmTransaction,
        })
      }
      return sendEvmTransaction({
        from,
        to: unsigned.to,
        data: unsigned.data,
        value: unsigned.value,
        ...(chain_id !== undefined ? { chainId: chain_id } : {}),
        ...(unsigned.fee_currency !== undefined ? { feeCurrency: unsigned.fee_currency } : {}),
      })
    }
    case 'evm-userop':
      throw new UnsupportedUnsignedTxError(
        'evm-userop',
        'sponsored UserOperation signing lands with the bundler config (#47); ' +
          'the server only emits this kind once COINBASE_PAYMASTER_URL is set',
      )
  }
}

/**
 * The full client leg in one call: sign + broadcast, then client-ping so
 * the server's verify pipeline takes over (deferred on network failure,
 * the pending-sync queue replays it).
 */
export async function signSendAndReport(args: {
  unsigned: UnsignedTx
  action: EscrowTxType
  chain_id: string
  escrow_id?: string
  onSigned?: () => void
}): Promise<string> {
  const tx_ref = await signAndSendUnsignedTx(args.unsigned, args.chain_id, args.onSigned)
  await useEscrowStore.getState().reportTx({
    tx_ref,
    action: args.action,
    chain_id: args.chain_id,
    ...(args.escrow_id !== undefined ? { escrow_id: args.escrow_id } : {}),
  })
  return tx_ref
}
