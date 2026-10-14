/**
 * The scalar shapes every component file and the path parameters share —
 * spelled once, so "a uuid", "an instant" or "a base-unit amount" cannot be
 * documented two ways.
 */
import { AMOUNT_RAW_PATTERN, LOCATIONS } from '@tenda/shared'
import { chainNamespaceEnum } from '@tenda/shared/db/schema'
import type { SchemaObject } from './schema-types'

export const uuid: SchemaObject = { type: 'string', format: 'uuid' }
export const latitude: SchemaObject = { type: 'number', minimum: -90, maximum: 90 }
export const longitude: SchemaObject = { type: 'number', minimum: -180, maximum: 180 }
export const isoInstant: SchemaObject = { type: 'string', format: 'date-time', description: 'ISO-8601 UTC' }
/** Base-unit integer as a canonical decimal STRING — never a JSON number (2^53 is too small). */
export const rawAmount: SchemaObject = { type: 'string', pattern: AMOUNT_RAW_PATTERN.source, description: 'Base units, decimal string' }
/**
 * The two CAIP-2 chain-id schemas below — SHAPE-checked, deliberately NOT
 * enumerated (#126). This block is the decision they share; each carries its
 * own note on which of the pair to use.
 *
 * It used to list every `CHAIN_MANIFEST` entry, which told a reader they could
 * send `solana:mainnet` or `eip155:8453` — both `status: 'planned'`, refused by
 * every deployment. The deeper error is that the question has two different
 * answers: which chains EXIST is a fact about the manifest, which chains a
 * deployment SETTLES ON is a fact about its `CHAIN_<id>_*` configuration, and
 * this document is a module-load constant that cannot see the second one.
 *
 * So it stops claiming to. The shape is checked here; the live set is published
 * by `GET /v1/platform/chains`, which already answers with the enabled chains
 * INTERSECTED with the adapter registry — the deployment's own truth, and the
 * same principle this scalar was getting wrong.
 *
 * The namespace alternation comes from the shared enum, so a third namespace is
 * one enum entry and nothing here.
 */

/** The shape ALONE — for a field that reports a chain id rather than asks for one. */
export const chainIdShape: SchemaObject = {
  type: 'string',
  // CAIP-2's own grammar for the reference half — `[-_a-zA-Z0-9]{1,32}`, which
  // admits no dot. Written to the spec the description names rather than to a
  // rough approximation of it; every manifest id satisfies it strictly.
  pattern: `^(${chainNamespaceEnum.join('|')}):[-_a-zA-Z0-9]{1,32}$`,
}

/**
 * The shape PLUS the pointer — what every field that ASKS for a chain id uses.
 *
 * Split from `chainIdShape` because the chain list's own `id` field would
 * otherwise tell a reader already inside `GET /v1/platform/chains` to go and
 * read `GET /v1/platform/chains`. Bytes matter here too: the description
 * repeats at every use, and this document's whole problem is size, which is
 * why it is terse and the reasoning lives in the docblock above.
 */
export const chainId: SchemaObject = {
  ...chainIdShape,
  description: 'CAIP-2. Not enumerated — GET /v1/platform/chains lists what THIS deployment settles on.',
}
/** ISO-3166 alpha-2 codes of the markets the product serves. */
export const COUNTRY_CODES = Object.keys(LOCATIONS)
