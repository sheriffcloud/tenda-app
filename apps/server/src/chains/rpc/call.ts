/**
 * THE failover combinator. One call, tried against each endpoint's client in
 * order, first success wins.
 *
 * Namespace-agnostic on purpose: it knows nothing about web3.js or viem, only
 * that a client can be asked to do something that may reject. EVM does not use
 * it — viem's own `fallback` transport does this better at the transport layer,
 * where it can see method-level detail — so in practice this is what makes
 * SOLANA callers failover-capable without each of them writing a try/catch.
 * Three of them had, differently.
 */

import { withTimeout } from '@tenda/shared'

/**
 * Run `operation` against the first client that succeeds.
 *
 * `timeout_ms` bounds EACH ATTEMPT, and without it this combinator does not
 * fail over at all for the failure that matters most. A degraded provider
 * usually does not reject — it accepts the connection and never answers — and
 * web3.js's `Connection` applies no request timeout of its own, so an unbounded
 * loop waits on the primary forever and never reaches the second endpoint.
 * MEASURED: still waiting after 1.5s against a client that never settles.
 *
 * A timed-out attempt is recorded as a FAILURE and the loop moves on, which is
 * what turns a hang into a failover rather than into a throw. Callers that
 * already impose their own budget (the relayer wraps every port method) may
 * omit it; callers with no other bound — the gas-seed funder, whose only reader
 * is a 15-minute monitor tick — must pass one.
 *
 * WHAT IT THROWS when every endpoint fails matters more than it looks. A bare
 * rethrow of the last error discards the primary's — usually the more
 * diagnostic one, since the fallback often fails for a boring reason like a
 * cold connection. An AggregateError keeps both, and still satisfies every
 * `catch` and `assert.rejects` that only cares THAT it failed. A single
 * endpoint rethrows its own error untouched, so the common case keeps the exact
 * error type callers already match on (`SeedBalanceUnreadableError`'s wrapper,
 * the relayer's preflight classification).
 */
export async function withRpcFallback<C, T>(
  clients: readonly [C, ...C[]],
  operation: (client: C) => Promise<T>,
  opts: { timeout_ms?: number } = {},
): Promise<T> {
  const errors: unknown[] = []
  for (const [index, client] of clients.entries()) {
    try {
      const attempt = operation(client)
      return await (opts.timeout_ms === undefined
        ? attempt
        : // `withTimeout` (shared) is the one race in this codebase; a second
          // hand-rolled Promise.race is how two timeout semantics appear.
          withTimeout(
            attempt,
            opts.timeout_ms,
            `rpc endpoint ${index + 1}/${clients.length} timed out after ${opts.timeout_ms}ms`,
          ))
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length === 1) throw errors[0]
  throw new AggregateError(errors, `all ${clients.length} rpc endpoints failed`)
}
