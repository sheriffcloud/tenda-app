/**
 * What the sell surface says when it has nothing to sell (#60).
 *
 * The tradable-option list is already filtered to chains the user holds a
 * verified wallet on, so an EMPTY list IS the message. It had four causes and
 * one rendering:
 *
 *   - web showed nothing at all, leaving a disabled CTA reading "Choose an
 *     asset" with no asset on screen to choose;
 *   - mobile said "link a wallet" for every cause, including while it was
 *     still looking — the one claim about the USER, made before we had asked.
 *
 * The causes come from `resolveWalletSection`, which already answers exactly
 * this question for the wallet screen: two independent loads (the linked
 * wallets and the chain registry), and which of them is missing. Reused rather
 * than re-derived — a second resolver is how the two surfaces would start
 * disagreeing about what an empty list means.
 */
import {
  SELL_CHAINS_UNAVAILABLE,
  SELL_WALLET_CHECKING,
  SELL_WALLET_LINK_CTA,
  SELL_WALLET_LOAD_FAILED,
  SELL_WALLET_RETRY,
} from '../constants/exchange'
import type {
  ChainRegistryStatus,
  WalletLoadStatus,
  WalletSectionState,
} from './section-state'

export interface SellSectionInput {
  walletsStatus: WalletLoadStatus
  chainsStatus: ChainRegistryStatus
  /** `isRegistryUsable(chains)` — non-null AND non-empty. */
  registryUsable: boolean
  /** Whether the filtering produced anything this reader can actually sell. */
  hasTradableOption: boolean
}

/**
 * Which of the five situations an empty sell list is in.
 *
 * The VOCABULARY is `resolveWalletSection`'s, deliberately — one set of names
 * for "why is there nothing here" across the wallet screen and this one. The
 * PRECEDENCE is not, and that is the whole reason this function exists:
 *
 *   - the wallet screen asks about wallets first, because with no wallet there
 *     is nothing to read balances FOR;
 *   - the sell surface asks about the REGISTRY first, because its option list
 *     is built by filtering chains — with no chains there was no list to
 *     filter, so "you have no wallet" would be a claim about the reader drawn
 *     entirely from our own outage. Measured: feeding this surface's empty
 *     list into the wallet screen's ordering answered `no-wallet` for a reader
 *     holding a verified wallet whose registry request had simply failed.
 *
 * It also makes `ready` mean "there is something to sell", so a caller can
 * never land on the picker with nothing in it.
 */
export function sellWalletSection(input: SellSectionInput): WalletSectionState {
  if (!input.registryUsable) {
    return input.chainsStatus === 'error' ? 'balances-unavailable' : 'loading'
  }
  if (input.hasTradableOption) return 'ready'
  if (input.walletsStatus === 'error') return 'wallets-error'
  // Only a SETTLED wallets load may say the reader has none.
  return input.walletsStatus === 'ready' ? 'no-wallet' : 'loading'
}

export interface SellWalletNotice {
  message: string
  /** The one control offered, or null while there is nothing to do but wait. */
  cta: string | null
  /**
   * Which control. The two retries are DIFFERENT loads — one re-reads the
   * linked wallets, the other the chain registry — so a caller cannot wire a
   * single "retry" and have it fix both.
   */
  action: 'link' | 'retry-wallets' | 'retry-chains' | null
}

/**
 * TOTAL over the section union, the same reason the composer's notice map is:
 * a new section state then breaks the BUILD here instead of silently
 * inheriting "link a wallet".
 *
 * `ready` is null because there is nothing to say — the caller renders the
 * picker. `loading` speaks but offers no control: it is a statement about us,
 * and the only honest response to it is to wait.
 */
const NOTICE_BY_SECTION: Record<
  WalletSectionState,
  ((noWalletMessage: string) => SellWalletNotice) | null
> = {
  ready: null,
  loading: () => ({ message: SELL_WALLET_CHECKING, cta: null, action: null }),
  'no-wallet': (noWalletMessage) => ({
    message: noWalletMessage,
    cta: SELL_WALLET_LINK_CTA,
    action: 'link',
  }),
  'wallets-error': () => ({
    message: SELL_WALLET_LOAD_FAILED,
    cta: SELL_WALLET_RETRY,
    action: 'retry-wallets',
  }),
  'balances-unavailable': () => ({
    message: SELL_CHAINS_UNAVAILABLE,
    cta: SELL_WALLET_RETRY,
    action: 'retry-chains',
  }),
}

/**
 * The notice for a resolved section, or null when the surface should render
 * its picker instead.
 *
 * `noWalletMessage` is the caller's, because it is the only mode-specific
 * line: cashing out and posting an offer need the same wallet for different
 * reasons, and each tab says so in its own words.
 */
export function sellWalletNotice(
  section: WalletSectionState,
  noWalletMessage: string,
): SellWalletNotice | null {
  const build = NOTICE_BY_SECTION[section] ?? null
  return build === null ? null : build(noWalletMessage)
}
