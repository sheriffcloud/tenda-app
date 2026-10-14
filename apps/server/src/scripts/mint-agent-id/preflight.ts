/**
 * Everything that must be true BEFORE a key signs anything.
 *
 * The mint writes a URI on-chain and costs real CELO. `_setAgentURI` exists, so
 * a wrong URI is repairable — but a mint against the WRONG WALLET is not: the
 * card is keyed by address, the token belongs to msg.sender, and AskBots
 * requires the funding wallet to match the registered agent wallet. So the
 * check that matters most is not "does the URI resolve" but "does the URI
 * describe the wallet that is about to sign".
 */

import { isEvmAddress } from '@tenda/shared'

/** One check's outcome. `detail` is printed whether it passed or failed. */
export interface Check {
  name: string
  ok: boolean
  detail: string
}

/** The subset of the card this script reasons about. */
interface FetchedCard {
  type?: unknown
  name?: unknown
  description?: unknown
  image?: unknown
  address?: unknown
  services?: unknown
  endpoints?: unknown
}

const REQUIRED_STRINGS = ['type', 'name', 'description', 'image'] as const

/** Hosts that resolve differently for everyone, so they cannot be a registry URI. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

function safeHost(uri: string): string | null {
  try {
    return new URL(uri).hostname
  } catch {
    return null
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Fetch the agentURI and check it is a registration file a reader will accept.
 *
 * Deliberately re-derived here rather than imported from `features/agent-card`:
 * this must fail when PRODUCTION serves the wrong thing, and importing the
 * builder would check the code in this checkout instead of the bytes on the
 * wire. The whole point is to catch "deployed the old shape" before minting.
 */
export async function checkAgentUri(uri: string, signer: string): Promise<Check[]> {
  const checks: Check[] = []

  // A URL only this machine can resolve, written permanently into a public
  // registry. It is the cheapest mistake to make — `API_BASE_URL` is
  // localhost in every developer .env, so the DEFAULT URI is wrong unless the
  // environment is production — and one of the more expensive to undo, since
  // repairing it costs a `_setAgentURI` transaction. Refused outright rather
  // than warned about.
  const host = safeHost(uri)
  if (host === null) {
    return [{ name: 'agentURI is a URL', ok: false, detail: `cannot parse '${uri}'` }]
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith('.local')) {
    return [
      {
        name: 'agentURI is publicly resolvable',
        ok: false,
        detail: `'${host}' is local — set API_BASE_URL to the public host, or pass --uri`,
      },
    ]
  }
  checks.push({ name: 'agentURI is publicly resolvable', ok: true, detail: host })

  let card: FetchedCard
  try {
    const res = await fetch(uri, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      return [{ name: 'agentURI resolves', ok: false, detail: `${uri} -> HTTP ${res.status}` }]
    }
    card = (await res.json()) as FetchedCard
    checks.push({ name: 'agentURI resolves', ok: true, detail: `${uri} -> 200` })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [{ name: 'agentURI resolves', ok: false, detail: `${uri} -> ${reason}` }]
  }

  for (const field of REQUIRED_STRINGS) {
    checks.push({
      name: `required \`${field}\``,
      ok: isNonEmptyString(card[field]),
      detail: isNonEmptyString(card[field]) ? String(card[field]).slice(0, 60) : 'MISSING or empty',
    })
  }

  // EIP-8004 requires `services`; Celo's docs name the array `endpoints`. The
  // card emits both (#105) and a reader may use either, so both must be there.
  for (const key of ['services', 'endpoints'] as const) {
    const value = card[key]
    const ok = Array.isArray(value) && value.length > 0
    checks.push({ name: `\`${key}\` array`, ok, detail: ok ? `${value.length} entries` : 'MISSING or empty' })
  }

  // THE ONE THAT CANNOT BE UNDONE. The token is minted to msg.sender; if the
  // card describes a different wallet, the registry points at a document about
  // somebody else and only a second mint fixes it.
  const cardAddress = isNonEmptyString(card.address) ? card.address.toLowerCase() : ''
  const matches = cardAddress === signer.toLowerCase()
  checks.push({
    name: 'card address IS the signing wallet',
    ok: matches,
    detail: matches ? cardAddress : `card says ${cardAddress || '(none)'}, signer is ${signer.toLowerCase()}`,
  })

  return checks
}

/**
 * The URI this script mints by default: the signer's own card on the configured
 * API host. Derived rather than typed by hand — a hand-typed URI is how the
 * address in the URL stops matching the wallet holding the key.
 */
export function defaultAgentUri(apiBaseUrl: string, address: string): string {
  if (!isEvmAddress(address)) throw new Error(`not an EVM address: ${address}`)
  return `${apiBaseUrl.replace(/\/+$/, '')}/.well-known/agents/${address.toLowerCase()}.json`
}

/** Print a check list; returns whether every check passed. */
export function reportChecks(checks: readonly Check[]): boolean {
  for (const check of checks) {
    console.log(`  ${check.ok ? 'OK ' : 'FAIL'}  ${check.name}: ${check.detail}`)
  }
  return checks.every((c) => c.ok)
}
