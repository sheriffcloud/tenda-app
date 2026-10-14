import {
  createQueryCache,
  registerAccountReset,
  type EscrowListRow,
  type ExchangeSummary,
  type GigSummary,
  type MyApplication,
  type MyDisputeRow,
  type NotificationWire,
  type QueryCache,
} from '@tenda/shared'

/**
 * Everything of WEB's that must not outlive an account.
 *
 * The registry itself is not here. `accountGeneration`, `isSameAccount`,
 * `beginAccountSession`, `registerAccountReset` and `clearAccountState` come
 * from `@tenda/shared`, where mobile reads them too (#65) and where web ran a
 * byte-equivalent private copy of them until #74. They are re-exported below, so
 * no import site in this app had to move. What is left here is the part that is
 * genuinely web's: the module-scoped list CACHES, and the fact that each one is
 * registered.
 *
 * The package ROOT is the only way in — there is no `@tenda/shared/account`
 * subpath in the exports map — which is what makes it ONE registry and ONE
 * counter rather than the two #74 removed. The suite beside this file asserts
 * that rather than assuming it.
 *
 * Two kinds of thing live longer than the components that fill them:
 *
 *   - module-scoped list CACHES, because the workspace's list columns are
 *     remounted by the router on every row they open, so page zero has to
 *     outlive the component or the column blinks; and
 *   - zustand STORES, which are module singletons by construction.
 *
 * Module scope also outlives the SESSION. Signing out is a soft navigation —
 * `router.replace('/')` keeps the JS context and every module in it — so
 * without this the next account in the same tab inherits the last one's state.
 * Measured before any of it existed: a second sign-in showed the first
 * account's dispute subjects, and (#25) the first account's gig detail,
 * counterparty and proofs included.
 *
 * REGISTER IN THE MODULE THAT OWNS THE STATE — a cache here, a store in its own
 * file. The alternative — a list of reset calls inside `logout` — is what this
 * arrangement exists to fix: three stores were added over three tasks and none
 * of them was ever added to that list, because the place you must not forget was
 * nowhere near the state you were writing.
 * `stores/__tests__/account-scope.guard.test.ts` fails on a new store that is
 * neither registered nor listed as account-agnostic, and the suite beside this
 * file fails on a cache exported here that the registry cannot reach — so
 * forgetting either kind is a red test rather than a leak.
 *
 * Account-AGNOSTIC state deliberately stays out: the chain registry and the
 * platform config are public server facts, identical for every reader, and
 * clearing them would refetch on the next sign-in for nothing — worse, it
 * would blank a rendered balance while the registry reloaded.
 */

export {
  accountGeneration,
  beginAccountSession,
  clearAccountState,
  isSameAccount,
  registerAccountReset,
} from '@tenda/shared'

/**
 * A cache that empties with the account.
 *
 * The registration is INSIDE the constructor rather than a call each declaration
 * has to remember, which is the same reasoning as registering beside the state:
 * a `createQueryCache()` written here and not registered is exactly the leak,
 * and this makes the two inseparable. The suite beside this file catches the
 * other half — a cache that skips this helper altogether.
 */
function register<TItem>(): QueryCache<TItem> {
  const cache = createQueryCache<TItem>()
  registerAccountReset(() => cache.clear())
  return cache
}

/** Page zero of "My Disputes", per bucket. */
export const disputesPageCache = register<MyDisputeRow>()

/**
 * My Gigs keeps FOUR lists so every tab's count is a real server total rather
 * than a zero for a list nobody fetched — which means four rebuilds per row
 * opened without these.
 */
export const postedGigsCache = register<GigSummary>()
export const workingGigsCache = register<GigSummary>()
export const draftGigsCache = register<GigSummary>()
export const myApplicationsCache = register<MyApplication>()

/** Page zero of the notification feed. */
export const notificationsCache = register<NotificationWire>()

/**
 * The exchange surface's two lists, per filter combination.
 *
 * This surface is not a list column, so it is not remounted per row — it is
 * UNMOUNTED, because opening an offer replaces the whole pane. Same outcome:
 * without these, coming back from an offer re-fetches the book the reader was
 * already reading and shows them a skeleton over it.
 *
 * `myTradesCache` is account-scoped and would otherwise show the previous
 * account its own trades after a same-tab switch; the order book is public to
 * anyone with the surface unlocked, and is registered because a cache outside
 * the registry is one nobody can empty.
 */
export const offerBookCache = register<ExchangeSummary>()
export const myTradesCache = register<EscrowListRow>()
