/**
 * A sample body for EVERY documented body — every response code, and every
 * request the operations take.
 *
 * The document records an example for a handful of them: two of the task
 * operation's eight statuses, and one of the three request bodies. Showing a
 * body only where one happens to exist teaches a reader that a 409 has no
 * shape and that `POST /v1/agent/register` takes nothing — so the rest are
 * SHAPED from the schema the document already references, and each sample says
 * which of the two it is. Nothing here is a written-out example: a hand-typed
 * body is the copy of the API that this package exists to prevent.
 *
 * Two facts the document knows about an error are filled in from the response
 * itself rather than from the schema: the status (it is the key the response
 * is filed under) and the message (it is the description the document wrote).
 * A code named in that description becomes `code` — but only when the
 * `ApiError` enum actually declares it, so a header or a standard named in
 * passing cannot be presented as an error the API can send.
 */
import type { ExampleValue, JsonContent, ResponseObject, SchemaObject } from '@tenda/api-doc'
import { COMPONENT_REF_PREFIX, JSON_MEDIA_TYPE } from './document'
import { asRecord, lookup } from './json'

/** Where a sample came from — the page says which, so neither is mistaken for the other. */
export type SampleSource = 'recorded' | 'derived'

export interface Sample {
  source: SampleSource
  value: ExampleValue
}

/** Schemas by component name, as `components.schemas` holds them. */
export type SchemaBook = Readonly<Record<string, SchemaObject>>

/**
 * The HTTP reason phrase for the statuses this document answers with.
 *
 * A register rather than a lookup table pulled from a dependency: the browser
 * has no `http.STATUS_CODES`, and a docs page needs exactly the statuses its
 * own document declares. `sample.test.ts` walks the document and fails if one
 * is missing, so it cannot fall behind the API.
 */
export const REASON_PHRASE: Readonly<Record<string, string>> = {
  '200': 'OK',
  '201': 'Created',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '409': 'Conflict',
  '410': 'Gone',
  '422': 'Unprocessable Entity',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '503': 'Service Unavailable',
}

/** SHOUTING_SNAKE — the shape every ErrorCode has, so prose can be searched for one. */
const ERROR_CODE_ALL = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g

/** Deepest a derived sample nests before it stops describing and starts repeating. */
const MAX_DEPTH = 6

const isErrorSchema = (schema: SchemaObject): boolean =>
  schema.properties !== undefined &&
  'statusCode' in schema.properties &&
  'code' in schema.properties &&
  'message' in schema.properties

/** Follow `$ref` into the book, guarding the cycles a self-referential schema would cause. */
function resolve(schema: SchemaObject, schemas: SchemaBook, seen: ReadonlySet<string>): {
  resolved: SchemaObject
  seen: ReadonlySet<string>
  cycle: string | null
} {
  if (schema.$ref === undefined) return { resolved: schema, seen, cycle: null }
  const name = schema.$ref.slice(COMPONENT_REF_PREFIX.length)
  if (seen.has(name)) return { resolved: schema, seen, cycle: name }
  const target = lookup(schemas, name)
  if (target === undefined) return { resolved: schema, seen, cycle: name }
  return { resolved: target, seen: new Set([...seen, name]), cycle: null }
}

/** A stand-in for a leaf the schema constrains only by type. */
function leaf(schema: SchemaObject, key: string): ExampleValue {
  if (schema.const !== undefined) return schema.const
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum[0]
  if (schema.default !== undefined) return schema.default
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  switch (type) {
    case 'integer':
    case 'number':
      return schema.minimum ?? 0
    case 'boolean':
      return false
    case 'null':
      return null
    default:
      // The field's own name, so a reader sees WHICH value goes where rather
      // than four identical placeholder strings down a body.
      return schema.format === undefined ? `<${key}>` : `<${schema.format}>`
  }
}

/** A value shaped like the schema — objects and arrays included. */
function shape(schema: SchemaObject, schemas: SchemaBook, key: string, depth: number, seen: ReadonlySet<string>): ExampleValue {
  const { resolved, seen: nextSeen, cycle } = resolve(schema, schemas, seen)
  if (cycle !== null) return `<${cycle}>`
  if (depth >= MAX_DEPTH) return `<${key}>`

  if (resolved.oneOf !== undefined && resolved.oneOf.length > 0) {
    // The first non-null branch: `oneOf: [T, null]` is how the document spells
    // a nullable field, and a sample of `null` shows a reader nothing.
    const branch = resolved.oneOf.find((b) => b.type !== 'null') ?? resolved.oneOf[0]
    return shape(branch, schemas, key, depth + 1, nextSeen)
  }

  const type = Array.isArray(resolved.type) ? resolved.type.find((t) => t !== 'null') : resolved.type

  if (type === 'array') {
    // One item: enough to show the element's shape, short enough to read.
    return resolved.items === undefined ? [] : [shape(resolved.items, schemas, key, depth + 1, nextSeen)]
  }

  if (type === 'object' || resolved.properties !== undefined) {
    const body: Record<string, ExampleValue> = {}
    for (const [name, property] of Object.entries(resolved.properties ?? {})) {
      body[name] = shape(property, schemas, name, depth + 1, nextSeen)
    }
    return body
  }

  return leaf(resolved, key)
}

/**
 * The first REAL error code the document names in its own prose.
 *
 * Checked against the enum the `ApiError` schema declares, not just matched by
 * shape: descriptions also carry SHOUTING_SNAKE words that are not codes —
 * `X_PAYMENT` is a header, `EIP_3009` a standard — and a sample claiming one
 * of those as `code` would be an error the API can never send.
 */
export function codeNamedIn(description: string, allowed: readonly string[]): string | null {
  const known = new Set(allowed)
  for (const match of description.match(ERROR_CODE_ALL) ?? []) {
    if (known.has(match)) return match
  }
  return null
}

/** The codes an ApiError may carry, from the schema that declares them. */
export function errorCodesIn(schemas: SchemaBook): readonly string[] {
  const enumerated = lookup(schemas, 'ApiError')?.properties?.code?.enum ?? []
  return enumerated.filter((value): value is string => typeof value === 'string')
}

/**
 * The sample for any documented body — a request's or a response's.
 *
 * The recorded example when the document has one, otherwise a body shaped from
 * the schema it already references. A REQUEST body needs this as much as a
 * response does: only one of the three operations that take a body carries a
 * recorded example, so without it the page tells a reader that
 * `POST /v1/agent/register` — step one of the guide — takes nothing.
 */
export function sampleForContent(content: JsonContent | undefined, schemas: SchemaBook): Sample | null {
  const body = content?.[JSON_MEDIA_TYPE]
  if (body === undefined) return null
  if (body.example !== undefined) return { source: 'recorded', value: body.example }
  return { source: 'derived', value: shape(body.schema, schemas, 'value', 0, new Set()) }
}

/**
 * The sample for one response, or null when the response declares no body.
 *
 * `status` and the response's own description are used only to fill the two
 * fields of an error envelope the schema cannot know; every other value comes
 * from the schema or from the document's recorded example.
 */
export function sampleForResponse(
  status: string,
  response: ResponseObject,
  schemas: SchemaBook,
): Sample | null {
  const declared = response.content?.[JSON_MEDIA_TYPE]
  const sample = sampleForContent(response.content, schemas)
  if (sample === null || sample.source === 'recorded' || declared === undefined) return sample

  const value = sample.value
  const { resolved } = resolve(declared.schema, schemas, new Set())
  const body = asRecord(value)
  if (!isErrorSchema(resolved) || body === null) return { source: 'derived', value }

  const named = codeNamedIn(response.description, errorCodesIn(schemas))
  return {
    source: 'derived',
    value: {
      ...body,
      statusCode: Number(status),
      error: lookup(REASON_PHRASE, status) ?? body.error,
      message: response.description,
      ...(named === null ? {} : { code: named }),
    },
  }
}
