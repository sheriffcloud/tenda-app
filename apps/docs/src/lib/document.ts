/**
 * The document, and the few views of it the page needs.
 *
 * `src/generated/agent-api.ts` is written by `scripts/generate-document.ts`
 * from `@tenda/api-doc` before anything compiles, so this module — and every
 * component below it — reads exactly what the server serves. Nothing here
 * describes the API; it only arranges what the document already says.
 */
import type { OpenApiDocument, OperationObject } from '@tenda/api-doc'
import { AGENT_API_DOCUMENT, AGENT_API_DOCUMENT_PATH, COMPONENT_REF_PREFIX, JSON_MEDIA_TYPE } from '../generated/agent-api'

export const apiDocument = AGENT_API_DOCUMENT

/** Re-exported from the generated module, never imported from the package at
 *  runtime — see the generator's header for why. */
export { COMPONENT_REF_PREFIX, AGENT_API_DOCUMENT_PATH, JSON_MEDIA_TYPE }

/** One operation, with the two facts the document keeps outside it. */
export interface ListedOperation {
  method: 'GET' | 'POST'
  path: string
  operation: OperationObject
}

/** Operations under one tag, in the order the document declares them. */
export interface TaggedOperations {
  name: string
  description: string
  operations: readonly ListedOperation[]
}

/**
 * Where the guarantees live in the document — named once, so the page can tell
 * a reader which field to read in the JSON without a second copy of the key.
 */
export const STABILITY_FIELD = 'x-tenda-stability'

/** An anchor a reader can link to and a heading can carry. */
export const anchorFor = (operationId: string): string => `op-${operationId}`

/**
 * Every operation, grouped by the tags the document declares. The document is
 * a PARAMETER so the orphan branch below can be exercised against one that has
 * an undeclared tag — no deployment's document should ever have one, which is
 * exactly why the branch would otherwise go untested.
 *
 * Grouped in the document's tag order, not alphabetically: `tags` reads as an
 * introduction — public reads, then the agent write surface, then what this
 * deployment is configured for — and re-sorting it would throw that away.
 *
 * An operation carrying a tag the document never declares would vanish from
 * the page, so the leftovers are collected rather than dropped — a docs site
 * that silently omits an endpoint is the failure this whole package is about.
 */
export function operationsByTag(source: OpenApiDocument = apiDocument): readonly TaggedOperations[] {
  const listed: ListedOperation[] = []
  for (const [path, item] of Object.entries(source.paths)) {
    if (item.get !== undefined) listed.push({ method: 'GET', path, operation: item.get })
    if (item.post !== undefined) listed.push({ method: 'POST', path, operation: item.post })
  }

  const declared = source.tags.map((tag) => ({
    name: tag.name,
    description: tag.description,
    operations: listed.filter((entry) => entry.operation.tags.includes(tag.name)),
  }))

  const claimed = new Set(declared.flatMap((tag) => tag.operations.map((entry) => entry.operation.operationId)))
  const orphans = listed.filter((entry) => !claimed.has(entry.operation.operationId))
  return orphans.length === 0
    ? declared
    : [...declared, { name: 'Other', description: 'Operations whose tag this document does not declare.', operations: orphans }]
}
