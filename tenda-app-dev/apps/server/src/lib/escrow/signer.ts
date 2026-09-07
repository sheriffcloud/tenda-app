/**
 * Route-layer half of the signer contract (the adapter half resolves the
 * chain-bound address): validate a CLIENT-requested signing wallet before a
 * build, and assert the wallet a build resolved is still LINKED after it.
 *
 * Both checks answer with ESCROW_WRONG_WALLET, but they differ in what the
 * client can do about it — a requested wallet that isn't the caller's carries
 * NO required_address (the fix is linking, there is nothing to switch to),
 * while an unlinked BOUND wallet names itself so the client can say exactly
 * which wallet to re-link.
 */
import { ErrorCode, truncateWallet, type ChainNamespace } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { resolveUserByWallet } from '@server/lib/auth/resolver'
import type { AppDatabase } from '@server/plugins/db'
import type { Caller } from './state-machine'

/**
 * Narrow a transition's derived Caller to a party role for the signer hints.
 * Party transitions can never be signed by a dispute admin — the state
 * machine refuses them earlier — so this throw is a tripwire, not a path.
 */
export function partyCaller(caller: Caller): 'creator' | 'counterparty' | 'assigned_counterparty' {
  if (caller === 'dispute_admin') {
    throw new AppError(
      500,
      ErrorCode.INTERNAL_ERROR,
      'a dispute admin cannot be the signing party of an escrow transition',
    )
  }
  return caller
}

/**
 * Read an optional `signer_address` off an untyped request body: absent (or
 * an absent body) is undefined, a non-empty string passes, anything else is
 * a 400 — silently ignoring garbage would fall back to the primary wallet
 * and sign with an account the client never asked for.
 */
export function readSignerPreference(body: unknown): string | undefined {
  if (body === null || body === undefined || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>).signer_address
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value === '') {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'signer_address must be a non-empty string')
  }
  return value
}

/** True when `address` is one of the user's verified linked wallets. */
async function ownsWallet(
  db: AppDatabase,
  user_id: string,
  chain_ns: ChainNamespace,
  address: string,
): Promise<boolean> {
  return (await resolveUserByWallet(db, { chain_ns, address })) === user_id
}

/**
 * Gate a client-requested `signer_address` (free actions: create, publish,
 * public accept). A wallet the caller does not own must never be baked into
 * a transaction — and answering 422 here is what keeps the adapter's default
 * (primary) the only other path.
 */
export async function assertCallerWallet(
  db: AppDatabase,
  args: { user_id: string; chain_ns: ChainNamespace; address: string },
): Promise<void> {
  if (!(await ownsWallet(db, args.user_id, args.chain_ns, args.address))) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_WRONG_WALLET,
      `${truncateWallet(args.address)} is not one of your linked wallets — link it in Settings, or sign with a wallet you have linked`,
    )
  }
}

/**
 * Post-build tripwire: the signer a build resolved (chain-bound or defaulted)
 * must still be a linked wallet of the acting user, or the verify pipeline
 * would install NULL actors downstream (`resolveUserByWallet` misses on
 * apply). Names the wallet so the client can route the user to re-link it.
 */
export async function assertSignerLinked(
  db: AppDatabase,
  args: { user_id: string; chain_ns: ChainNamespace; address: string },
): Promise<void> {
  if (!(await ownsWallet(db, args.user_id, args.chain_ns, args.address))) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_WRONG_WALLET,
      `this escrow is signed by ${truncateWallet(args.address)}, which is no longer one of your linked wallets — re-link it in Settings to continue`,
      { required_address: args.address },
    )
  }
}
