/**
 * What a gig composer may offer, and what it must say about it.
 *
 * Two questions, one source: WHICH chains are offerable and which one the
 * composer opens on (#58), and whether it can be finished at all (#59). Both
 * are read off the same option list, which is the point — the wall a wallet-
 * less poster hit at the signature was always derivable from what the picker
 * was already rendering.
 *
 * ONE owner for both clients. Web and mobile each carried this inline and
 * character-identical, and what shipped gated only EVM:
 *
 *   enabled: c.namespace !== 'eip155' || hasEvmWallet
 *
 * Solana was therefore hardcoded ALWAYS enabled, and the composer's default
 * chain was a constant pointing at it. A fresh account with no wallet at all
 * saw Solana selected and live beside correctly-greyed EVM chips — so the one
 * enabled chip read as *verified*, the form was filled, and the refusal
 * arrived at signing as a 403. A user who had linked only an EVM wallet got
 * the same wall, having done exactly what the UI asked of them.
 *
 * The rule here is the honest one: a chain is offerable when the user holds a
 * verified wallet on ITS namespace, whatever that namespace is.
 *
 * WHY A `state` AND NOT JUST A BOOLEAN: three different situations disable a
 * chip and they must not read alike. "You have no wallet" is a true statement
 * only in one of them; saying it while the trust list is still loading, or
 * after it FAILED, is the dead end `ApplyWalletPicker` was built to remove.
 * A boolean cannot carry that difference, so it is derived from the state
 * rather than being the source.
 *
 * WHY IT LIVES UNDER wallet/: the question is a wallet-capability one, and
 * this folder already imports `../chains` (see allowance.ts, evm-tx-status.ts)
 * — putting it here adds no new dependency direction between the two.
 */

import type { LinkedWallet } from '../api/contracts/auth.contract'
import type { ChainRegistryEntry } from '../api/contracts/platform.contract'
import { gigAssetByChain } from '../chains'
import {
  COMPOSER_WALLET_BODY,
  COMPOSER_WALLET_CTA,
  COMPOSER_WALLET_RETRY,
  COMPOSER_WALLET_TITLE,
  COMPOSER_WALLET_UNAVAILABLE_BODY,
  COMPOSER_WALLET_UNAVAILABLE_TITLE,
} from '../constants/gig-composer'
import { verifiedWalletsOn } from './wallet-address'
import type { WalletsStatus } from './section-state'

/**
 * Why a chain is or isn't offerable. `needs_wallet` is the only one that may
 * be phrased as "link a wallet" — the other two are statements about our own
 * loading, not about what the user has.
 */
export type ChainOptionState = 'ready' | 'needs_wallet' | 'wallets_loading' | 'wallets_unavailable'

/**
 * The parenthetical a picker appends to a disabled chip, or null when the
 * chip needs none. SHARED so web and mobile cannot describe the same state
 * differently — a chain called "loading" on one client and "link a wallet" on
 * the other is the drift #58 exists to end.
 */
const CHAIN_OPTION_NOTE: Record<ChainOptionState, string | null> = {
  ready: null,
  needs_wallet: '(link a wallet)',
  wallets_loading: '(checking wallets)',
  wallets_unavailable: '(wallets unavailable)',
}

export interface GigChainOption {
  id: string
  label: string
  state: ChainOptionState
  /** Derived, never set independently: `state === 'ready'`. */
  enabled: boolean
}

/**
 * What a chip reads: the chain's name, plus WHY it cannot be picked when it
 * cannot. Composed here rather than in each picker — web and mobile render
 * with different primitives but say the same sentence, and a per-client copy
 * of this two-line rule is how the two labels drift apart. That is the same
 * shape of duplication #58 was filed for.
 */
export function chainOptionLabel(option: GigChainOption): string {
  const note = CHAIN_OPTION_NOTE[option.state]
  return note === null ? option.label : `${option.label} ${note}`
}

/**
 * Registry chains that carry gigs, each tagged with whether this user can
 * actually sign on it.
 *
 * Eligibility is unchanged and still policy-derived: the shared
 * `gigAssetByChain` names the chain's gig asset, and the registry must
 * actually carry that asset (the server 400s a chain it doesn't run, so the
 * manifest alone is not enough).
 */
export function gigChainOptions(args: {
  registry: readonly ChainRegistryEntry[]
  wallets: readonly LinkedWallet[]
  walletsStatus: WalletsStatus
}): GigChainOption[] {
  const { registry, wallets, walletsStatus } = args
  return registry
    .filter((c) => {
      const gigAsset = gigAssetByChain(c.id)
      return gigAsset !== null && c.assets.some((a) => a.id === gigAsset)
    })
    .map((c) => {
      const state = chainOptionState(c.namespace, wallets, walletsStatus)
      return { id: c.id, label: c.display_name, state, enabled: state === 'ready' }
    })
}

function chainOptionState(
  namespace: ChainRegistryEntry['namespace'],
  wallets: readonly LinkedWallet[],
  walletsStatus: WalletsStatus,
): ChainOptionState {
  // A wallet in hand answers the question outright. Checked BEFORE the status
  // so a stale or never-refreshed status cannot hide a wallet the caller can
  // already see — the list is the trust source, the status only explains its
  // absence.
  if (verifiedWalletsOn(namespace, wallets).length > 0) return 'ready'
  if (walletsStatus === 'error') return 'wallets_unavailable'
  // ONLY an explicit 'ready' may produce "you have no wallet". 'idle' means
  // nobody has asked yet, which reads the same as in-flight to anyone looking
  // at the screen, and a caller that omits the status entirely is likewise
  // telling us nothing — a real case, caught by web's wizard test whose store
  // mock had no walletsStatus at all. Defaulting the unknown to "no wallet"
  // puts the one message that must be EARNED on the screen for free.
  if (walletsStatus !== 'ready') return 'wallets_loading'
  return 'needs_wallet'
}

/**
 * Whether the composer can be COMPLETED at all, read off the same options the
 * picker renders (#59).
 *
 * Before this, the only thing that knew a wallet was missing was the server,
 * and it said so at `Review and sign` — after the whole form was filled, and
 * by way of a redirect that took the form with it. The facts were on screen
 * the entire time; nothing asked them the question.
 *
 * `unknown` is the load-bearing state and it renders NOTHING. There are two
 * ways to have no answer yet — the wallet list has not settled, or the chain
 * registry has not landed (an empty `options`) — and neither earns the right
 * to tell someone they have no wallet. That is the same rule the option
 * states carry, applied one level up: a claim about the USER is only made
 * from a settled, non-empty list.
 */
export type ComposerWalletGate = 'ok' | 'unknown' | 'needs_wallet' | 'unavailable'

/**
 * What a composer's wallet notice says, and which control it offers — or null
 * when it must stay silent.
 *
 * TOTAL over the gate union on purpose, the same reason `TX_LABEL` is total
 * over EscrowTxType: a fifth state then breaks the BUILD here instead of
 * quietly inheriting "you have no wallet", which is the one claim in this
 * whole feature that must be earned. It is shared for the second reason too —
 * web and mobile were each choosing this copy with their own ternaries, so a
 * reworded `unavailable` on one client would silently not reach the other.
 */
export interface ComposerWalletNoticeCopy {
  title: string
  body: string
  cta: string
  /** `link` goes to the wallet settings; `retry` re-runs the wallets load. */
  action: 'link' | 'retry'
}

const COMPOSER_WALLET_NOTICE: Record<ComposerWalletGate, ComposerWalletNoticeCopy | null> = {
  ok: null,
  unknown: null,
  needs_wallet: {
    title: COMPOSER_WALLET_TITLE,
    body: COMPOSER_WALLET_BODY,
    cta: COMPOSER_WALLET_CTA,
    action: 'link',
  },
  unavailable: {
    title: COMPOSER_WALLET_UNAVAILABLE_TITLE,
    body: COMPOSER_WALLET_UNAVAILABLE_BODY,
    cta: COMPOSER_WALLET_RETRY,
    action: 'retry',
  },
}

/**
 * The notice for a gate state, or null when the composer must say nothing.
 *
 * `?? null` is not belt-and-braces: a Record lookup answers `undefined` for a
 * key outside the union, and both notices guard with `=== null`, so an
 * undefined would sail past the guard into `notice.title` and blank the
 * composer. The signature promises `| null`; this makes that true of the
 * VALUE and not just of the type.
 */
export function composerWalletNotice(gate: ComposerWalletGate): ComposerWalletNoticeCopy | null {
  return COMPOSER_WALLET_NOTICE[gate] ?? null
}

export function composerWalletGate(options: readonly GigChainOption[]): ComposerWalletGate {
  // No options at all = the registry has not answered. Nothing is known about
  // this user's wallets from an empty list, so say nothing.
  if (options.length === 0) return 'unknown'
  if (options.some((o) => o.enabled)) return 'ok'
  // Every option is disabled — now WHY, and the answer must be the honest one
  // even when the states are mixed. A chain still checking outranks a failure,
  // and both outrank "you have no wallet": the last is the only one that
  // accuses the user of something, so it is the last one we are allowed to
  // reach for.
  if (options.some((o) => o.state === 'wallets_loading')) return 'unknown'
  if (options.some((o) => o.state === 'wallets_unavailable')) return 'unavailable'
  // EVERY, not a bare fallthrough. "You have no wallet" is the one claim in
  // this feature that has to be earned, so it is stated only when every
  // option actually says so — a state this function does not recognise falls
  // to silence rather than inheriting the accusation.
  return options.every((o) => o.state === 'needs_wallet') ? 'needs_wallet' : 'unknown'
}

/**
 * The chain a composer should open on: the first the user can actually sign
 * on, else `fallback`.
 *
 * Callers DERIVE their selection from this during render rather than syncing
 * it into state from an effect: the registry and the wallet list both land
 * after first paint, and a `useState` seeded at mount cannot see either. An
 * effect that wrote the answer back would also be a setState-in-effect, which
 * the lint rule rejects for exactly this reason.
 *
 * The fallback is the caller's configured default and is deliberately still
 * returned when nothing is ready — a composer has to start somewhere, and
 * with no wallet at all every option is disabled anyway, so the selection is
 * inert until one is linked. What it must NOT do is what the old constant
 * did: leave a user who linked one namespace pointed at another.
 */
export function defaultGigChainId(options: readonly GigChainOption[], fallback: string): string {
  return options.find((o) => o.enabled)?.id ?? fallback
}
