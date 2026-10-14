/**
 * Database fixtures for the claim suites: a seedable chain, a user who passes
 * every account-side gate, and live deps wired to a real store.
 *
 * Shared by the two integration files for the same reason the unit fixture is
 * shared — the alternative is two copies of "what an eligible user looks like",
 * and the day one of them gains a gate the other keeps passing without it.
 */
import type { FastifyInstance } from 'fastify'
import { chains } from '@tenda/shared/db/schema/chains'
import { user_identities, user_wallets } from '@tenda/shared/db/schema/identity'
import { device_tokens } from '@tenda/shared/db/schema/messaging'
import {
  drizzleGasSeedClaimStore,
  drizzleGasSeedStore,
  type GasSeedClaimDeps,
  type GasSeedFunder,
} from '@server/features/gas-seed'
import { createUser } from './test-app'

export const CHAIN = 'eip155:16661'
export const AMOUNT = '10000000000000000'
export const FUNDER = '0x00000000000000000000000000000000000000f1'

let seq = 0
export function evmAddress(): `0x${string}` {
  seq += 1
  return `0x${seq.toString(16).padStart(40, '0')}`
}

/** 0G mainnet, seedable. `resetDb` truncates, so a plain insert is enough. */
export async function withSeedableChain(app: FastifyInstance): Promise<void> {
  await app.db.insert(chains).values({
    id: CHAIN,
    namespace: 'eip155',
    display_name: '0G',
    min_confirmations: 2,
    treasury_address: evmAddress(),
    escrow_program: evmAddress(),
    gas_seed_amount_raw: AMOUNT,
    gas_seed_wallet_address: FUNDER,
  })
}

/** A user who passes every account-side gate: verified phone + a device. */
export async function eligibleUser(app: FastifyInstance): Promise<{ id: string; wallet: string }> {
  const user = await createUser(app)
  const wallet = evmAddress()
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155',
    address: wallet,
    user_id: user.row.id,
    is_primary: true,
  })
  await app.db.insert(user_identities).values({
    user_id: user.row.id,
    kind: 'phone',
    identifier: `+2348${String(seq).padStart(9, '0')}`,
    verified_at: new Date(),
  })
  await app.db
    .insert(device_tokens)
    .values({ user_id: user.row.id, token: `expo-${seq}`, platform: 'expo' })
  return { id: user.row.id, wallet }
}

export function deps(app: FastifyInstance, over: Partial<GasSeedClaimDeps> = {}): GasSeedClaimDeps {
  const funder: GasSeedFunder = { address: FUNDER, balance: async () => 10n ** 30n }
  return {
    seed: drizzleGasSeedStore(app.db),
    claim: drizzleGasSeedClaimStore(app.db),
    funders: new Map([[CHAIN, funder]]),
    enqueue: async () => {},
    log: { info() {}, warn() {} },
    ...over,
  }
}

