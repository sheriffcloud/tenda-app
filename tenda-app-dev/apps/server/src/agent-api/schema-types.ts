/**
 * The subset of JSON Schema (draft 2020-12, as OpenAPI 3.1 embeds it) the
 * Agent API document uses — typed so the document is checked at compile time
 * instead of being an untyped blob. Deliberately small: every keyword here is
 * one the drift test validates with, so nothing in the spec is decoration.
 */

type JsonPrimitive = string | number | boolean | null

/** A JSON Schema type name, or a list of them (`['string', 'null']`). */
type SchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'

export interface SchemaObject {
  $ref?: ComponentRef
  type?: SchemaType | readonly SchemaType[]
  description?: string
  /** Documentary only — the drift test does not validate formats. */
  format?: string
  pattern?: string
  enum?: readonly JsonPrimitive[]
  const?: JsonPrimitive
  minimum?: number
  /** Numeric, per draft 2020-12 (the boolean form is draft-4 and strict ajv refuses it). */
  exclusiveMinimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  properties?: Readonly<Record<string, SchemaObject>>
  required?: readonly string[]
  additionalProperties?: boolean | SchemaObject
  items?: SchemaObject
  maxItems?: number
  oneOf?: readonly SchemaObject[]
}

/**
 * The names the document registers under `components.schemas` — the only
 * legal `$ref` targets. The two maps (./schemas, ./schemas-agent) are typed
 * `Record<…ComponentName, SchemaObject>` against these, so a schema missing
 * from its map, or a `ref()` to a name nothing registers, is a compile error.
 */
export const V0_COMPONENT_NAMES = [
  'UserRef', 'ProofParams', 'EscrowProof', 'Dispute', 'Review', 'GigApplication', 'Viewer',
  'GigSummary', 'GigDetail', 'GigFacets', 'PaginatedGigs', 'FeaturedGigs', 'ApiError',
] as const
export const V1_COMPONENT_NAMES = [
  'AgentRegisterBody', 'AgentAccount', 'AgentRegisterResponse', 'AgentTaskBody', 'EvmCreateParamsWire',
  'ReceiveAuthorizationTypedData', 'EvmAuthorizationTerms', 'SolanaTransactionTerms', 'RelayTerms',
  'AgentTaskPaymentRequired', 'AgentTaskCreated',
] as const
export type V0ComponentName = (typeof V0_COMPONENT_NAMES)[number]
export type V1ComponentName = (typeof V1_COMPONENT_NAMES)[number]
export type ComponentName = V0ComponentName | V1ComponentName

/** Where `$ref` targets live — spelled once, here, and read back by the drift tests. */
export const COMPONENT_REF_PREFIX = '#/components/schemas/'
export type ComponentRef = `${typeof COMPONENT_REF_PREFIX}${ComponentName}`

/** `{ $ref: '#/components/schemas/<name>' }` for a registered component. */
export function ref(name: ComponentName): SchemaObject {
  return { $ref: `${COMPONENT_REF_PREFIX}${name}` }
}

/** A closed object: every documented field listed, nothing else admitted. */
export function closed(
  properties: Readonly<Record<string, SchemaObject>>,
  required: readonly string[],
  description?: string,
): SchemaObject {
  return {
    type: 'object',
    ...(description !== undefined ? { description } : {}),
    properties,
    required,
    additionalProperties: false,
  }
}

/** The keys of `T` that are not optional — what a closed schema may list as `required`. */
export type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T] &
  string

/**
 * A closed object BOUND to a wire type: `properties` must name every key of
 * `T` and nothing else (a field the type gains is a compile error here until
 * it is documented; a key the type lacks is refused), and `required` may only
 * list keys `T` itself marks non-optional. The drift test validates live
 * bodies against the result; this binds the request bodies too, which no live
 * response ever exercises.
 */
export function closedFor<T extends object>(
  properties: Readonly<Record<keyof T & string, SchemaObject>>,
  required: readonly RequiredKeys<T>[],
  description?: string,
): SchemaObject {
  return closed(properties, required, description)
}

/**
 * The `required` list of a schema whose wire type has NO optional key: every
 * documented property. Typed so it only compiles for such a type — a type
 * with an optional key cannot be "all required", and the call fails.
 */
export function allKeys<T extends object>(
  properties: Readonly<Record<keyof T & string, SchemaObject>>,
): readonly (keyof T & string)[] {
  return Object.keys(properties) as (keyof T & string)[]
}

/**
 * `schema | null`. A schema with its own `type` gains 'null' in that list
 * (once — an already-nullable list is returned as it is); one without (a
 * `$ref`, a `oneOf`) is wrapped instead — `type: ['null']` beside a `oneOf`
 * would contradict every branch, and strict ajv refuses to compile it.
 *
 * Strict validators admit no other type list than `X | null`, so a list that
 * is not already nullable is the caller's own violation, not one made here.
 */
export function nullable(schema: SchemaObject): SchemaObject {
  if (schema.type === undefined) return { oneOf: [schema, { type: 'null' }] }
  // An `enum` is a whitelist of VALUES, checked independently of `type`: a
  // nullable enum that lists no null still refuses null. Add it once.
  const withNullEnum =
    schema.enum !== undefined && !schema.enum.includes(null) ? { ...schema, enum: [...schema.enum, null] } : schema
  if (typeof schema.type === 'string') return { ...withNullEnum, type: [schema.type, 'null'] }
  return schema.type.includes('null') ? withNullEnum : { ...withNullEnum, type: [...schema.type, 'null'] }
}
