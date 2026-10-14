/**
 * Test-only helpers shipped as `@tenda/shared/testing` (#140) — the one place
 * a fixture gets the fields of a wire type that no test asserts on.
 *
 * WHY IT EXISTS. Every REQUIRED field added to `ChainRegistryEntry` was paid
 * for by hand in every fixture that builds one: `roles` (#129) ~24 sites,
 * then `relayed_funding_available` / `rpc_url` / `explorer_url` /
 * `faucet_url` (#132/#137) 32 sites, and the sweep missed inline literals
 * twice. None of those suites care about the values; they were typing them to
 * satisfy the type. With the fields spread from here, the next required field
 * is ONE edit in this module, and the compiler then names every fixture that
 * still needs something only it can supply.
 *
 * HONEST BY CONSTRUCTION. A known chain id gets the manifest's real `kind`
 * and public facts through the same lookups the route serves (`findChain`,
 * `chainPublicFacts`); a fabricated id gets `testnet` and nulls. The route
 * never lists such a chain at all — every adapter is built from a manifest
 * entry — so the helper is answering for a chain that cannot be served, not
 * imitating one the route would. `relayed_funding_available` and
 * `approval_window_seconds` are the per-deployment facts: the first defaults
 * to false, the second to FIXTURE_APPROVAL_WINDOW_SECONDS — a fixture that
 * needs a relaying chain or another window says so by overriding after the
 * spread.
 *
 * Runtime code must never import this module: it is a fixture seam, exported
 * under its own subpath so the main barrel stays runtime-only.
 */
import type { ChainRegistryEntry } from '../api/contracts/platform.contract'
import { chainPublicFacts, findChain } from '../chains/manifest-queries'

/** The registry-entry fields a fixture should not have to spell: deployment + public facts. */
export type RegistryEntryDefaults = Pick<
  ChainRegistryEntry,
  'network_kind' | 'relayed_funding_available' | 'approval_window_seconds' | 'rpc_url' | 'explorer_url' | 'faucet_url'
>

/**
 * The window a fixture chain reports — 24 hours, a value a real deployment
 * can carry (Celo mainnet does). Named so a test that asserts on it says so
 * rather than repeating the number.
 */
export const FIXTURE_APPROVAL_WINDOW_SECONDS = 86_400

/**
 * Spread AFTER a fixture's own identity fields and BEFORE any override:
 *
 *   { id, namespace, display_name, escrow_address, ...registryEntryDefaults(id), assets }
 */
export function registryEntryDefaults(id: string): RegistryEntryDefaults {
  // A fabricated id is a TEST chain by definition — the fixture invented it.
  return {
    network_kind: findChain(id)?.kind ?? 'testnet',
    relayed_funding_available: false,
    approval_window_seconds: FIXTURE_APPROVAL_WINDOW_SECONDS,
    ...chainPublicFacts(id),
  }
}
