/**
 * Test helpers for anything that checks a body against the Agent API document.
 * A separate subpath (`@tenda/api-doc/testing`), so the document entry point
 * never pulls the validator in: ajv is a dev dependency, and only suites load
 * this file.
 */
export { COMPONENT_REF_PREFIX, agentApiAjv, strictAjv } from './agent-api-validator'
export { plainProse } from './document-prose'
