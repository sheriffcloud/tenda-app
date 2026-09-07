/**
 * The lifecycle of one asynchronous read, as ONE union.
 *
 * This vocabulary was already written twice — `WalletLoadStatus` here and
 * `InboxStatus` in web's chat.store (which notifications.store imports) — and
 * a third copy was about to be added for the profile counts. The members are
 * identical every time, because the states are a property of "a read" and not
 * of any particular screen.
 *
 * Four states, and the distinction that earns the fourth: `idle` is "nothing
 * has been asked for yet", `ready` is "the answer is in hand, including when
 * the answer is zero", and `error` is "we could not check". Collapsing `error`
 * into `ready` is what lets a screen print 0 as fact when the truth is that it
 * does not know — the defect this type exists to make unrepresentable.
 */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
