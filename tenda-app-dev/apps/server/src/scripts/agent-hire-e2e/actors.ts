/**
 * The two actors of the #20 loop, each restricted to what it is allowed to use.
 *
 * The AGENT is deliberately HTTP-ONLY apart from signing: it never reads the
 * chain, never estimates gas, never sees an RPC URL. That restriction IS the
 * claim — an agent with a key and an HTTP client can hire — so it is enforced
 * here by construction rather than asserted afterwards.
 *
 * The WORKER is the human's stand-in and does what the app does: OTP sign-in,
 * profile, link wallet, then sign the transactions the server hands back.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PrivateKeyAccount } from 'viem/accounts'
import { apiRoutes, type AgentRegisterResponse, type UnsignedTx } from '@tenda/shared'

export interface Api {
  (path: string, init?: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> }): Promise<{
    status: number
    json: Record<string, unknown>
    headers: Headers
  }>
}

export function makeApi(baseUrl: string): Api {
  return async (path, init = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        // Only when there IS a body: fastify refuses a JSON content-type with an
        // empty body, and several of these routes take no body at all.
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.token !== undefined ? { authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
    } catch {
      json = { raw: text }
    }
    return { status: res.status, json, headers: res.headers }
  }
}

export function expectStatus(
  label: string,
  got: { status: number; json: Record<string, unknown> },
  want: number,
): void {
  if (got.status !== want) {
    throw new Error(`${label}: expected ${want}, got ${got.status} — ${JSON.stringify(got.json)}`)
  }
}

/** The message shape `lib/auth-message.ts` parses (URI unchecked outside production). */
function authMessage(address: string, chainId: string, nonce: string, issuedAt: string): string {
  return [
    'Tenda wants you to sign in with your wallet:',
    address,
    '',
    `Chain: ${chainId}`,
    `URI: http://127.0.0.1:3000`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

/** A fresh nonce-signed wallet proof for `address`, signed by `account`. */
export async function walletProof(
  api: Api,
  account: PrivateKeyAccount,
  chainId: string,
): Promise<{ chain_id: string; address: string; message: string; signature: string }> {
  const nonceRes = await api(apiRoutes.auth.nonce, { method: 'POST' })
  expectStatus('POST /v1/auth/nonce', nonceRes, 200)
  const { nonce, issued_at } = nonceRes.json as { nonce: string; issued_at: string }
  const message = authMessage(account.address, chainId, nonce, issued_at)
  return {
    chain_id: chainId,
    address: account.address,
    message,
    signature: await account.signMessage({ message }),
  }
}

/** POST /v1/agent/register — the agent's whole account creation, HTTP only. */
export async function registerAgent(
  api: Api,
  account: PrivateKeyAccount,
  chainId: string,
  name: string,
): Promise<AgentRegisterResponse> {
  const proof = await walletProof(api, account, chainId)
  const res = await api(apiRoutes.agent.register, { method: 'POST', body: { ...proof, name } })
  expectStatus('POST /v1/agent/register', res, 200)
  return res.json as unknown as AgentRegisterResponse
}

/**
 * Read the OTP the dev console sender logged. `senders.ts#consoleSender` warns
 * `{ channel, identifier, code }` when no provider key is set, and pino-pretty
 * renders each field on its own line — so find the identifier, then the first
 * `code:` after it.
 */
export function otpFromLog(logPath: string, identifier: string): string {
  // pino-pretty COLOURS the dev log, so the raw bytes are
  // `\x1b[36mcode\x1b[0m: \x1b[33m"006721"\x1b[0m` — strip the escapes before
  // matching or the regex silently never fires.
  const lines = readFileSync(logPath, 'utf8')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes(identifier)) continue
    for (let j = i; j < Math.min(i + 6, lines.length); j += 1) {
      const m = /code:\s*"?(\d{4,8})"?/.exec(lines[j])
      if (m !== null) return m[1]
    }
  }
  throw new Error(`no OTP for ${identifier} in ${logPath}`)
}

async function pollOtp(logPath: string, identifier: string, tries = 20): Promise<string> {
  for (let i = 0; i < tries; i += 1) {
    try {
      return otpFromLog(logPath, identifier)
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error(`no OTP for ${identifier} after ${tries}s — is the send-otp worker running?`)
}

/**
 * Get the worker to a state where they can transact: signed in, named, with
 * their wallet linked.
 *
 * IDEMPOTENT on purpose — the worker's wallet is funded with real testnet gas,
 * so a re-run must reuse the SAME wallet, and a wallet belongs to exactly one
 * account. So: try the wallet sign-in first (which is what a returning user
 * does), and only fall back to a fresh OTP sign-up + link when this wallet has
 * never been seen. Without this the second run dies on
 * "wallet … is already linked".
 */
export async function onboardWorker(
  api: Api,
  account: PrivateKeyAccount,
  chainId: string,
  logPath: string,
): Promise<{ token: string; id: string; how: string }> {
  const returning = await api(apiRoutes.auth.verify, {
    method: 'POST',
    body: { method: 'wallet', ...(await walletProof(api, account, chainId)) },
  })
  if (returning.status === 200) {
    const { token, user } = returning.json as { token: string; user: { id: string } }
    await ensureName(api, token)
    return { token, id: user.id, how: 'returning (wallet sign-in)' }
  }

  const phone = `+23480${String(Date.now()).slice(-8)}`
  expectStatus(
    'POST /v1/auth/challenge',
    await api(apiRoutes.auth.challenge, { method: 'POST', body: { method: 'phone', identifier: phone } }),
    202,
  )
  const code = await pollOtp(logPath, phone)
  const verify = await api(apiRoutes.auth.verify, {
    method: 'POST',
    body: { method: 'phone', identifier: phone, code },
  })
  expectStatus('POST /v1/auth/verify', verify, 200)
  const { token, user } = verify.json as { token: string; user: { id: string } }
  await ensureName(api, token)
  expectStatus(
    'POST /v1/auth/link-wallet',
    await api(apiRoutes.auth.linkWallet, { method: 'POST', token, body: await walletProof(api, account, chainId) }),
    200,
  )
  return { token, id: user.id, how: `new (OTP ${phone})` }
}

/** requireProfileComplete wants BOTH halves non-blank. */
async function ensureName(api: Api, token: string): Promise<void> {
  expectStatus(
    'PATCH /v1/users/me (name)',
    await api(apiRoutes.users.updateMe, {
      method: 'PATCH',
      token,
      body: { first_name: 'Ada', last_name: 'Worker' },
    }),
    200,
  )
}

/** Ask the server for a transition's unsigned tx. */
export async function buildTransition(
  api: Api,
  token: string,
  path: string,
  body?: unknown,
): Promise<UnsignedTx> {
  const res = await api(path, { method: 'POST', token, ...(body !== undefined ? { body } : {}) })
  expectStatus(`POST ${path}`, res, 200)
  return (res.json as { unsigned: UnsignedTx }).unsigned
}

/** The client-ping every signed transition ends with. */
export async function ping(
  api: Api,
  token: string,
  args: { tx_ref: string; action: string; chain_id: string; escrow_id: string },
): Promise<void> {
  const res = await api(apiRoutes.blockchain.clientPing, { method: 'POST', token, body: args })
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`client-ping failed: ${res.status} ${JSON.stringify(res.json)}`)
  }
}

export const newOperationId = (): string => randomUUID()
