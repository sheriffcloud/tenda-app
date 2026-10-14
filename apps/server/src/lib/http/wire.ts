import type { Wire } from '@tenda/shared'

/**
 * A row as a client receives it: every `Date` an ISO string.
 *
 * Fastify serialises a returned `Date` through its `toJSON`, so the wire form of
 * a Drizzle row is exactly its JSON round trip. Doing the round trip here makes
 * the DECLARED reply type (`Wire<Row>` in AdminContract) the thing the compiler
 * holds the handler to, where a reply typed with the row model would say `Date`
 * and a reply typed `unknown` said nothing at all. The assignment from
 * `JSON.parse` is the one place the type is taken on trust, and what it trusts
 * is the same transform the reply goes through anyway.
 */
export function toWire<T extends object>(row: T): Wire<T> {
  const wire: Wire<T> = JSON.parse(JSON.stringify(row))
  return wire
}
