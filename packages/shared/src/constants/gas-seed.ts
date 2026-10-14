/**
 * The gas grant's lifecycle vocabulary (#58).
 *
 * WHY A STATUS EXISTS AT ALL. It used to not, and that absence is what cost the
 * feature two money bugs. `gas_grants` carried only a `tx_ref`, so "the slot is
 * reserved but nothing has been broadcast" had to be smuggled into that column
 * as a `pending:<user>:<chain>` placeholder string, and there was nowhere to say
 * the one thing that actually matters here — BROADCAST, NOT YET CONFIRMED. With
 * no way to record it, confirmation had to resolve inside the send call, so
 * every confirmation timeout became a guess: release the slot and risk paying a
 * user whose money already left, or keep it and risk stranding one who was never
 * paid. Both guesses were wrong in production, once per namespace.
 *
 * A transfer that has been broadcast is a FACT, and a fact belongs in a column.
 * Once it is one, the confirm step is an ordinary queued job that asks the chain
 * by hash and retries until the chain answers — the same shape `jobs/verify-tx`
 * has used for escrow transactions since #34.
 */

/**
 * FOUR states. Two are terminal, and they are terminal for opposite reasons.
 *
 *   claimed   — the slot is reserved (the PK insert won). Nothing has been
 *               signed or broadcast, so releasing here is always safe.
 *   submitted — a signed transaction exists and its reference is recorded. Money
 *               may or may not have moved; only the chain knows, and the confirm
 *               job is what asks it. This is the state that had nowhere to live,
 *               and whose absence caused both money bugs.
 *   delivered — the chain confirmed the transfer succeeded. Terminal, resolved.
 *   unresolved— the confirm job stopped asking. Terminal, and UNKNOWN.
 *
 * `unresolved` is not a failure and must never be read as one. It says: a
 * transaction was signed and recorded, and the chain never gave an answer within
 * the window we were willing to wait. The money may have moved. Because nobody
 * knows, the slot deliberately STAYS TAKEN — a user who might already hold their
 * seed must not be able to claim a second one — and a human decides, with
 * `verify:gas-seed` naming exactly these rows. Automatic recovery from "we do
 * not know" is precisely the guess this whole design removed.
 *
 * It exists because `submitted` was doing two jobs. A grant broadcast four
 * seconds ago and one whose confirmation exhausted every retry hours earlier
 * were the same row, so the state that needs a person looked exactly like the
 * state that needs nothing.
 *
 * There is NO `failed`, and that omission IS deliberate. A chain-attested
 * failure DELETES the row: the primary key is (user_id, chain_id), so a retained
 * `failed` row would block the retry it exists to permit, and a user who
 * received nothing could never claim again. The distinction that matters is
 * whether the chain ANSWERED — an answer of "it failed" frees the user to try
 * again, no answer at all does not.
 */
export const GAS_GRANT_STATUSES = ['claimed', 'submitted', 'delivered', 'unresolved'] as const

export type GasGrantStatus = (typeof GAS_GRANT_STATUSES)[number]

/**
 * How long a `submitted` grant may go unanswered before the confirm job stops
 * asking and marks it `unresolved`.
 *
 * Six hours, and the number is chosen against the slowest thing that can still
 * legitimately resolve: an EVM transaction is pinned at a nonce and never
 * expires, so one broadcast during a fee spike can sit in mempools for hours and
 * then mine normally. Giving up on it early would strand a user who is about to
 * be paid — and worse, would do so in a state a person then has to investigate
 * by hand.
 *
 * Solana rarely reaches this bound: its transactions provably die with their
 * blockhash, so its confirm path resolves an unknown signature to a real failure
 * (and releases the slot) minutes after broadcast. This window is what EVM's
 * lack of an equivalent costs.
 */
export const GAS_SEED_UNRESOLVED_AFTER_MS = 6 * 60 * 60 * 1_000
