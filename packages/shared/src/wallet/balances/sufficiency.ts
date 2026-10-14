/**
 * Pre-flight balance check for value-moving escrow transactions (create,
 * publish-draft, dispute-bond) — moved from apps/mobile/wallet/balances/
 * sufficiency.ts 2026-08-15. The CHAIN is passed in (each client resolves it
 * from its own registry store; that lookup is the one platform-bound line the
 * mobile module had).
 *
 * NOT a security control — the chain is the authority (the escrow's
 * transferFrom / msg.value check reverts an underfunded call regardless). This
 * exists so the user learns they're short BEFORE a wallet prompt, a permit
 * signature, and a draft they'd have to retry.
 *
 * Deliberately FAIL-OPEN: an unreadable balance is NOT insufficient. This is
 * the opposite of `readAllowance`, and the asymmetry is intentional — a failed
 * allowance read costs one spurious approve prompt, whereas treating an RPC
 * hiccup as "no funds" would block a fully-funded user from posting. Every
 * failure path here lands on exactly the pre-existing behaviour: proceed, and
 * let the chain decide. The check can only ever stop a transaction it
 * positively read as short.
 */
import type { ChainNamespace } from '../../db/schema/chains'
import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'
import { formatAssetAmount } from '../../constants/assets'
import { withTimeout } from '../../utils/async'
import { WalletError } from '../errors'
import { readSpendableBalance } from './spendable'
import { toBigIntOrNull } from './raw-amount'
import { DEFAULT_READERS } from './read'
import type { BalanceReader } from './types'

/**
 * Budget for the whole pre-flight. Tighter than `BALANCE_RPC_TIMEOUT_MS`
 * (10s) because this one blocks a flow that is otherwise instant: it sits in
 * front of the wallet opening, so a degraded RPC must surrender fast and fall
 * open rather than leave the user staring at a spinner.
 */
export const SUFFICIENCY_TIMEOUT_MS = 5_000

/**
 * The signer holds less of `assetId` than the transaction will debit. Carries
 * base-unit amounts only — callers format via the shared `formatAssetAmount`,
 * the same helper the detail screens use, so there is exactly one place that
 * decides how an amount reads.
 */
export class InsufficientBalanceError extends WalletError {
  constructor(
    public readonly assetId: string,
    public readonly requiredRaw: string,
    public readonly availableRaw: string,
  ) {
    super(
      'insufficient_balance',
      `You need ${formatAssetAmount(requiredRaw, assetId)} but your wallet holds ${formatAssetAmount(availableRaw, assetId)}.`,
    )
    this.name = 'InsufficientBalanceError'
  }
}

/**
 * Throw `InsufficientBalanceError` only when NO wallet in `owners` can cover
 * `amountRaw` of `assetId` on `chain`. Resolves silently in every other
 * case, including when the balance can't be determined (see the fail-open
 * note above) or when `chain` is null (registry not loaded / unknown id).
 *
 * Why the whole set and not just the likely signer: the signing wallet isn't
 * fixed until the wallet opens — the session guard can re-point the signer at
 * whichever linked wallet the user connects. Reading one wallet would let a
 * user with two linked wallets be told "you hold 0" while their other wallet
 * — and the wallet screen's headline — says otherwise. "The primary is
 * short" is not the same claim as "you cannot fund this", and only the second
 * one earns a block.
 *
 * `owners` is passed in rather than resolved here: the signer set lives
 * behind each client's `resolveSignersForChain`. An empty set (no linked
 * wallet) falls open — the 9D transaction gate owns that case and routes the
 * user to link one.
 *
 * Comparison is BigInt-exact. Base units routinely exceed Number.MAX_SAFE_
 * INTEGER (1 ETH = 1e18), so a numeric compare here would silently mis-answer
 * for 18-decimal assets.
 */
export async function ensureSufficientBalanceOn(
  chain: ChainRegistryEntry | null,
  args: {
    assetId: string
    amountRaw: string
    owners: readonly string[]
  },
  readers: Record<ChainNamespace, BalanceReader> = DEFAULT_READERS,
): Promise<void> {
  if (args.owners.length === 0) return

  const required = toBigIntOrNull(args.amountRaw)
  if (required === null || required <= 0n) return

  if (chain === null) return

  let spendable: Awaited<ReturnType<typeof readSpendableBalance>>
  try {
    spendable = await withTimeout(
      readSpendableBalance(args.owners, chain, args.assetId, readers),
      SUFFICIENCY_TIMEOUT_MS,
    )
  } catch {
    // Timed out or an unexpected reader failure. Fall open by construction:
    // this catch is what guarantees the invariant survives any future reader
    // that decides to reject rather than omit.
    return
  }
  // null = unknown (asset not on this chain, or a read failed). Never "zero" —
  // conflating the two is what would block a funded user.
  if (spendable === null) return

  const available = toBigIntOrNull(spendable.amountRaw)
  if (available === null) return

  if (available < required) {
    throw new InsufficientBalanceError(args.assetId, args.amountRaw, spendable.amountRaw)
  }
}
