/**
 * The ONE validator configuration the Agent API suites share.
 *
 * Strict compile (a schema a strict validator refuses is a document defect),
 * no type coercion and no unknown-key stripping — the last two are ajv's
 * defaults, but they are the settings the closed-schema drift guarantee
 * depends on, so they are pinned here rather than restated per suite where one
 * copy could quietly loosen.
 */
import Ajv from 'ajv'
import { AGENT_API_DOCUMENT } from '@server/agent-api/openapi'
import { COMPONENT_REF_PREFIX } from '@server/agent-api/schema-types'

export { COMPONENT_REF_PREFIX }

export function strictAjv(): Ajv {
  return new Ajv({ strict: true, allErrors: true, validateFormats: false })
}

/** A strict validator with every component schema registered under its `$ref`. */
export function agentApiAjv(): Ajv {
  const ajv = strictAjv()
  for (const [name, schema] of Object.entries(AGENT_API_DOCUMENT.components.schemas)) {
    ajv.addSchema(schema, `${COMPONENT_REF_PREFIX}${name}`)
  }
  return ajv
}
