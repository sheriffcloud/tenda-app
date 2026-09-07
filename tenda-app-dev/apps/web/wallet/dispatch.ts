/**
 * UnsignedTx dispatcher — web port of apps/mobile/wallet/dispatch.ts: one
 * entry point that routes a server-built unsigned transaction to the right
 * transport and returns the chain's tx_ref for the client-ping.
 *
 *  - solana-tx   → connected-wallet sign + app-side broadcast (shared
 *                  resilient transport)
 *  - evm-tx      → guarded eth_sendTransaction over the AppKit session;
 *                  feeCurrency passes through for CELO
 *  - evm-userop  → BLOCKED on #47 (same as mobile): the server only emits
 *                  this kind once the paymaster env exists, so the typed
 *                  error below is unreachable until then, and loud if reached.
 *
 * Signer resolution runs the shared trust rules (pickWalletAddress over the
 * LINKED wallets registry); the live "session address" on web is whatever
 * the AppKit modal reports for the namespace — the modal IS the session.
 */
import type { ChainNamespace, EscrowTxType, UnsignedTx } from '@tenda/shared'
import {
  ensureAllowance,
  findChain,
  orderedSignerAddresses,
  pickWalletAddress,
} from '@tenda/shared'
import { peekWalletRuntime } from './runtime'
import { ensureSignerSession } from './send/session'
import { sendEvmTransaction } from './send/evm'
import { signAndSendSolanaTx } from './send/solana'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { useEscrowStore } from '@/stores/escrow.store'

export class UnsupportedUnsignedTxError extends Error {
  constructor(kind: string, detail: string) {
    super(`cannot sign '${kind}': ${detail}`)
    this.name = 'UnsupportedUnsignedTxError'
  }
}

/**
 * The two registries signer resolution and the balance gate read — the
 * linked-wallets trust list and the chain registry. A tx path must never
 * depend on some other surface having happened to load them: an empty
 * wallets[] makes `resolveSignersForChain` answer [] and the balance
 * pre-flight fall open, and a null chain does the same. Both loads are
 * once-only and deduped; neither throws (a failed load falls open exactly
 * like the gate itself, and `ensureSessionOn` re-asserts the trust list with
 * a hard error before anything signs).
 */
export async function ensureTxPreconditions(): Promise<void> {
  await Promise.all([
    useAuthStore.getState().ensureWallets(),
    useChainRegistryStore.getState().ensureLoaded(),
  ])
}

/** The modal's live address for a namespace — peek-only, never boots the stack. */
export function sessionAddressFor(ns: ChainNamespace): string | null {
  const runtime = peekWalletRuntime()
  const address = runtime?.modal.getAddress(ns)
  return typeof address === 'string' && address !== '' ? address : null
}

/**
 * The account this browser signs from on a namespace. `wallets[]` is the
 * source of trust: the live session address is honoured only while it's
 * still a verified linked wallet, otherwise the primary (or first) verified
 * linked wallet on that namespace wins.
 */
export function resolveSignerFor(ns: ChainNamespace): string | null {
  return pickWalletAddress(ns, sessionAddressFor(ns), useAuthStore.getState().wallets)
}

/**
 * EVERY wallet that could sign on this chain, most-likely-signer first — the
 * candidate set a balance check must reason over, since the signing wallet
 * isn't fixed until the connect modal opens. Namespace comes from the
 * manifest (never a string split on the id), so an unknown id yields []
 * rather than a guess.
 */
export function resolveSignersForChain(chainId: string): string[] {
  const ns = findChain(chainId)?.namespace
  if (ns === undefined) return []
  return orderedSignerAddresses(ns, sessionAddressFor(ns), useAuthStore.getState().wallets)
}

/**
 * The EVM account this browser signs/sends from, the SINGLE resolution both
 * dispatch and the permit flow use, so the permit's `owner` can never
 * diverge from the eventual `msg.sender`.
 */
export function resolveEvmFrom(): string | null {
  return resolveSignerFor('eip155')
}

/**
 * The wallet this client intends to sign with on `chainId`, as declared to
 * the server on free-signer builds (create / publish / accept) and on
 * dispute. Same resolution the confirm dialog's signer row previews and the
 * permit's owner uses — one answer for all four consumers is the signer
 * contract's coherence rule. Undefined (unknown chain / nothing linked)
 * simply declares nothing: the server falls back to its default.
 */
export function declaredSignerFor(chainId: string): string | undefined {
  const ns = findChain(chainId)?.namespace
  if (ns === undefined) return undefined
  return resolveSignerFor(ns) ?? undefined
}

/** Sign + broadcast a server-built unsigned tx. Returns the tx_ref. */
export async function signAndSendUnsignedTx(
  unsigned: UnsignedTx,
  chain_id?: string,
  onSigned?: () => void,
): Promise<string> {
  switch (unsigned.kind) {
    case 'solana-tx': {
      // Unlike mobile (MWA owns its own session), the web wallet session
      // lives in the AppKit modal — guarantee a live, LINKED one first. When
      // the server named the baked signer (signer_address), the session must
      // be THAT wallet: any other one cannot sign this tx at all.
      await ensureSignerSession('solana', unsigned.signer_address)
      return signAndSendSolanaTx(unsigned.tx_base64, onSigned)
    }
    case 'evm-tx': {
      // Guarantee a live, linked session first (connect-on-demand) — pinned
      // to the wire's signer_address when present (the chain-bound sender:
      // any other `from` reverts on the contract's party check).
      await ensureSignerSession('eip155', unsigned.signer_address)
      const from = unsigned.signer_address ?? resolveEvmFrom()
      if (from === null) {
        throw new Error('no EVM wallet connected, link one in Settings → Wallets first')
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
 * the server's verify pipeline takes over (best-effort on network failure —
 * the server's listeners converge without it).
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
