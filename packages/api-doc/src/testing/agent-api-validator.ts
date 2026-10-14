/**
 * The ONE validator configuration the Agent API suites share.
 *
 * Every option the closed-schema drift guarantee rests on, set EXPLICITLY:
 *
 *  - `strict` — a schema a strict validator refuses is a document defect, not
 *    a validator setting to relax.
 *  - `coerceTypes: false` and `removeAdditional: false` — these are ajv's
 *    defaults today, and the guarantee is exactly that a live body with a new
 *    field, or a string where a number belongs, FAILS. Left implicit they were
 *    a default an ajv major could change under the suites without a line of
 *    this repo moving; written down they are a decision.
 *  - `allErrors` — report every violation, so a failure names the whole gap
 *    rather than the first field of it.
 *  - `validateFormats: false` — `format` is documentary in this document (see
 *    SchemaObject.format in @tenda/api-doc); validating it here would fail
 *    bodies the contract never promised to constrain.
 *
 * Set here rather than per suite, where one copy could quietly loosen.
 */
import Ajv from 'ajv'
import { AGENT_API_DOCUMENT, COMPONENT_REF_PREFIX } from '../index'

export { COMPONENT_REF_PREFIX }

export function strictAjv(): Ajv {
  return new Ajv({
    strict: true,
    allErrors: true,
    validateFormats: false,
    coerceTypes: false,
    removeAdditional: false,
  })
}

/** A strict validator with every component schema registered under its `$ref`. */
export function agentApiAjv(): Ajv {
  const ajv = strictAjv()
  for (const [name, schema] of Object.entries(AGENT_API_DOCUMENT.components.schemas)) {
    ajv.addSchema(schema, `${COMPONENT_REF_PREFIX}${name}`)
  }
  return ajv
}
