/**
 * Stage 3 convergence check (#17) — Solana devnet, against a RUNNING server.
 *
 * Creates a real escrow on chain and deliberately never tells the server about
 * it: no POST /v1/blockchain/transaction. The DB must reach `open` purely from
 * the polling listener's ingest.
 *
 * That is the property the deploy cannot demonstrate on its own. It proves the
 * listener is watching the right program from the right cursor AND that the
 * event decodes against the current IDL — a client ping masks both, because it
 * hands the server the signature it would otherwise have to discover.
 *
 * NOT a CI test, which is why it lives here and not under test/: it needs a
 * funded devnet wallet, a live server, Redis, and ~40s of real block time.
 *
 *   pnpm test:devnet:convergence
 *
 * Requires DATABASE_URL, JWT_SECRET and RPC_URL (see the script in
 * package.json, which sources them from .env), a running server (API_BASE_URL,
 * default http://localhost:3000), and a keypair holding devnet SOL
 * (SOLANA_KEYPAIR, default ~/.config/solana/id.json).
 *
 * On success it cancels the on-chain escrow before removing the rows it
 * created; on failure it leaves them for inspection and prints the ids.
 *
 * KNOWN GAP: this exercises EscrowCreated only. The events Stage 3 actually
 * added — CounterpartyAssigned / AssignmentReleased — need an approval-mode
 * GIG, and gigs on solana:devnet are USDC-only; fund the wallet from
 * faucet.circle.com to extend this to the assign → unassign path.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import postgres from 'postgres'
import crypto from 'node:crypto'

const CHAIN = 'solana:devnet'
const API = process.env.API_BASE_URL ?? 'http://localhost:3000'
const KEYPAIR = process.env.SOLANA_KEYPAIR ?? path.join(os.homedir(), '.config/solana/id.json')

// Fail on the missing input, not five steps later inside createHmac or the
// postgres driver — this runs by hand, so the first line has to say why.
for (const name of ['DATABASE_URL', 'JWT_SECRET', 'RPC_URL']) {
  if (!process.env[name]) throw new Error(`${name} is not set — run via \`pnpm test:devnet:convergence\``)
}
const RPC = process.env.RPC_URL
const DB = process.env.DATABASE_URL

const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, 'utf8'))))
const address = kp.publicKey.toBase58()
const sql = postgres(DB)
const log = (...a) => console.log(...a)

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return json
}

// ── 1. a user owning this wallet, with a token ─────────────────────────────
// Seeded directly rather than through the OTP flow: wallet is a LINKED method
// (auth redesign), not a sign-up one, and the property under test is the
// listener — not how a session is minted. The JWT is signed with the server's
// own secret and payload shape (lib/auth/session.ts).
const [user] = await sql`
  INSERT INTO users (first_name, last_name, role, status)
  VALUES ('Convergence', 'Check', 'user', 'active')
  RETURNING id`
await sql`
  INSERT INTO user_wallets (user_id, chain_ns, address, is_primary, verified_at)
  VALUES (${user.id}, 'solana', ${address}, true, now())
  ON CONFLICT (chain_ns, address) DO UPDATE
    SET user_id = excluded.user_id, is_primary = true, verified_at = now()`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const head = b64({ alg: 'HS256', typ: 'JWT' })
const payload = b64({ id: user.id, role: 'user', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })
const mac = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${head}.${payload}`).digest('base64url')
const token = `${head}.${payload}.${mac}`
// The contact gate at first transaction wants a verified email or phone.
await sql`
  INSERT INTO user_identities (user_id, kind, identifier, email, verified_at)
  VALUES (${user.id}, 'email', ${'convergence+' + user.id.slice(0, 8) + '@tenda.test'},
          ${'convergence+' + user.id.slice(0, 8) + '@tenda.test'}, now())`
log(`✓ user ${user.id} owns ${address}`)

// Profile gate on POST /v1/escrows.
await api('/v1/users/me', {
  method: 'PATCH',
  token,
  body: { first_name: 'Convergence', last_name: 'Check' },
})

// ── 2. create the draft + unsigned tx ──────────────────────────────────────
const created = await api('/v1/escrows', {
  method: 'POST',
  token,
  body: {
    // Exchange + native SOL: gigs are USDC-only on this chain and the wallet
    // holds no devnet USDC. The kind is irrelevant to what is under test —
    // EscrowCreated, listener discovery and the applier are identical.
    kind: 'exchange',
    chain_id: CHAIN,
    asset: 'SOL_DEVNET',
    amount_raw: '10000000', // 0.01 SOL
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    completion_duration_seconds: 24 * 3600,
  },
})
const escrowId = created.escrow_id
log(`✓ draft escrow ${escrowId}`)

const before = await sql`SELECT status FROM escrows WHERE id = ${escrowId}`
log(`  db status before: ${before[0]?.status}`)

// ── 3. sign + broadcast, telling the server NOTHING ────────────────────────
const raw = Buffer.from(created.unsigned.tx_base64, 'base64')
const tx = VersionedTransaction.deserialize(raw)
tx.sign([kp])
const conn = new Connection(RPC, 'confirmed')
const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
log(`✓ broadcast ${sig}`)
await conn.confirmTransaction(sig, 'confirmed')
log('✓ confirmed on chain — server has NOT been told')

// ── 4. wait for the listener alone to converge the DB ──────────────────────
const deadline = Date.now() + 180_000
let status = before[0]?.status
let txRow = null
while (Date.now() < deadline) {
  const rows = await sql`SELECT status FROM escrows WHERE id = ${escrowId}`
  status = rows[0]?.status
  const txs = await sql`SELECT tx_ref, type FROM escrow_transactions WHERE escrow_id = ${escrowId}`
  txRow = txs[0] ?? null
  if (status === 'open') break
  await new Promise((r) => setTimeout(r, 3000))
}

const cursor = await sql`SELECT last_block FROM chain_cursors WHERE chain_id = ${CHAIN}`
log('')
log(`escrow status : ${status}`)
log(`tx row        : ${txRow ? `${txRow.type} ${txRow.tx_ref.slice(0, 20)}…` : '(none)'}`)
log(`cursor slot   : ${cursor[0]?.last_block ?? '(none)'}`)
log(`signature     : ${sig}`)
log('')
const converged = status === 'open'
log(converged ? '✅ CONVERGED from the listener alone' : '❌ DID NOT CONVERGE')

// ── 5. settle the chain escrow, then put the dev DB back ────────────────────
// Deleting an OPEN row would discard the only local pointer to locked funds.
// Cancel first and require the listener to observe that cancellation too.
let settled = false
if (converged) {
  const cancelled = await api(`/v1/escrows/${escrowId}/cancel`, { method: 'POST', token })
  const cancelTx = VersionedTransaction.deserialize(
    Buffer.from(cancelled.unsigned.tx_base64, 'base64'),
  )
  cancelTx.sign([kp])
  const cancelSig = await conn.sendRawTransaction(cancelTx.serialize(), { skipPreflight: false })
  await conn.confirmTransaction(cancelSig, 'confirmed')
  log(`✓ cancellation confirmed ${cancelSig}`)

  const cancelDeadline = Date.now() + 180_000
  while (Date.now() < cancelDeadline) {
    const rows = await sql`SELECT status FROM escrows WHERE id = ${escrowId}`
    if (rows[0]?.status === 'cancelled') {
      settled = true
      break
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  log(settled ? '✅ CANCELLED and funds released' : '❌ cancellation did not converge')
}

// Only after both transitions converge: a failed run is evidence worth
// retaining. `escrows.creator_id` is ON DELETE RESTRICT, so escrow goes first.
if (settled) {
  await sql`DELETE FROM escrows WHERE id = ${escrowId}`
  await sql`DELETE FROM users WHERE id = ${user.id}`
  log('  cleaned up: escrow + user')
} else {
  log(`  left for inspection: escrow ${escrowId}, user ${user.id}`)
}
await sql.end()
process.exit(settled ? 0 : 1)
