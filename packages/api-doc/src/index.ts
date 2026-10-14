/**
 * The Agent API document, as a package (#157).
 *
 * ONE builder. The server serves what this exports at `/v1/openapi.json` and
 * `/v1/agent/openapi.json`; the docs site (stage 2, not built yet) will render
 * the same object at build time rather than fetching it. Neither will own it,
 * so neither can drift from the other — the failure this package exists to
 * prevent is a second, hand-written description of the same API.
 *
 * `@tenda/shared` is the ONLY dependency. Everything the document states about
 * this deployment's operational behaviour — the featured rail size, the
 * listener cadence, the reconcile horizon, the auth methods, the nonce's shape
 * and lifetime — comes from `constants/published-operations` there, so the
 * document can quote real values without importing the server.
 *
 * One entry point rather than a subpath map: the document is one artefact, and
 * every module below is part of describing it.
 */
export * from './examples'
export * from './guide'
export * from './openapi'
export * from './paths'
export * from './paths-agent'
export * from './paths-auth'
export * from './platform'
export * from './recorded-exchange'
export * from './scalars'
export * from './schema-types'
export * from './schemas'
export * from './schemas-agent'
export * from './schemas-auth'
export * from './schemas-proofs'
