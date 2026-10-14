/**
 * The public agent card — the whole feature, in one directory.
 *
 * WHAT IT IS. The document an ERC-8004 Identity Registry mint points at.
 * `register(agentURI)` commits a URI on-chain; this is what resolves there, and
 * a reader holding only an address discovers from it what the agent can do and
 * where to reach it.
 *
 * WHY THE URI IS SELF-HOSTED rather than IPFS. `setAgentURI(uint256,string)` is
 * present on Celo's registry (verified on-chain 2026-09-05: it reverts "Not
 * authorized" for a non-owner, where a nonexistent selector reverts with no
 * data), so the pointer CAN be changed later — but changing it costs a
 * transaction each time. A stable URL whose CONTENT changes freely is the
 * cheaper shape while capabilities are still moving, and it binds the agent to
 * a domain over TLS, which is the identity claim ERC-8004 exists to support.
 *
 * A CARD FOR AN UNKNOWN ADDRESS IS STILL A CARD (`registered: false`). The URI
 * is committed at MINT time, which can precede any Tenda-side registration — a
 * 404 in that window is an on-chain pointer that reads as broken. Deliberate,
 * confirmed with the user 2026-09-05.
 *
 * HOW TO ATTACH IT — one import, one call:
 *
 *   import { buildAgentCard, drizzleAgentCardStore } from '@server/features/agent-card'
 *
 * The route under `routes/well-known/agents/` is the only caller, and the
 * FOLDER is its registration (autoPrefix) — no line in `app.ts`, unlike
 * `/.well-known/assetlinks.json` which is hardcoded there. That is what keeps
 * "delete the folder" true when #81 absorbs this.
 *
 * REMOVAL RECIPE — keep this true:
 *   1. delete this directory;
 *   2. delete `src/routes/well-known/agents/` (the folder IS the registration);
 *   3. delete `test/unit/agent-card.test.ts`, the integration suite, and
 *      `test/unit/agent-card-module-boundary.test.ts`;
 *   4. drop `'/.well-known/agents/:file'` from NON_CONTRACT_PATHS in
 *      `test/integration/api-routes-drift.test.ts`, which otherwise fails
 *      naming a path the server no longer serves;
 *   5. delete `.c8rc.agent-card.json` and its `test:coverage:agent-card` script.
 * `APP_INFO.external.logo` (#105) is the one thing added OUTSIDE this directory.
 * It may stay: a brand mark's URL is a standalone product fact that belongs in
 * shared whether or not this card exists, and no step above needs it removed.
 * Nothing else references it: no plugin, no registry line, no env var — and
 * step 3's boundary test is what keeps that sentence true, by failing if a
 * second importer ever appears.
 */

export {
  buildAgentCard,
  REGISTRATION_TYPE,
  type AgentCard,
  type AgentCardEndpoint,
  type AgentIdentity,
  type EipService,
  type AgentServiceType,
  type ServiceEndpoint,
  type WalletEndpoint,
} from './card'
export { drizzleAgentCardStore, type AgentCardStore } from './store'
