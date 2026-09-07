/**
 * Which account an EVM escrow call must be sent FROM (`msg.sender`). Unlike
 * Solana nothing is baked into the calldata — the contract checks the sender
 * against the party it bound at create/accept — so this resolver's job is to
 * REPORT the requirement on the wire (`signer_address`) and to refuse a
 * client-declared signer that the chain contradicts, naming the one that
 * works (which is what lets the client rebuild a permit for the right owner
 * BEFORE anything signs).
 *
 * Deliberately FAIL-OPEN on the state read: a transient RPC failure omits
 * the field and the client behaves exactly as before it existed. It must
 * never newly block an approve. (disputeEscrow is the exception by history —
 * its build already required the read for bond denomination and keeps its
 * existing throw; the resolver just reuses that read.)
 */
import { ErrorCode, sameWalletAddress } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { BuildTxArgs, EscrowState } from '@server/chains/types'
import { escrowIdHex } from './create-params'
import { fetchEscrowState, type EvmAdapterContext } from './state'
import { boundPartyAddress } from '@server/chains/signer-role'

/** This chain's state, mapped into the SHARED role rule (signer-role.ts). */
function boundAddressFor(
  caller: NonNullable<BuildTxArgs['caller']>,
  state: EscrowState,
): string | null {
  return boundPartyAddress(caller, {
    creator: state.creator_address,
    counterparty: state.counterparty_address,
    assigned_counterparty: state.assigned_counterparty_address,
  })
}

export async function resolveEvmSigner(
  ctx: EvmAdapterContext,
  build: BuildTxArgs,
  target: `0x${string}`,
  /** State a previous step already read (the dispute branch), else null. */
  prefetched: EscrowState | null,
): Promise<string | null> {
  if (build.action === 'resolveDispute') return build.signer_address
  const requested = build.signer_address
  if (build.action === 'createEscrow') {
    // Free by definition — no binding exists. Only what the client itself
    // declared is enforced; absent stays absent (legacy behaviour, no
    // phantom primary enforcement on a chain that accepts any sender).
    return requested ?? null
  }
  if (build.caller === undefined) return null // caller-less legacy build

  let state = prefetched
  if (state === null) {
    try {
      state = await fetchEscrowState(ctx, escrowIdHex(build.payload.escrow_id), target)
    } catch {
      return null
    }
  }
  if (state === null) return null

  const bound = boundAddressFor(build.caller, state)
  if (bound === null) return requested ?? null // public accept — still free
  // The SHARED case rule (checksum-agnostic on eip155) — never re-inlined.
  if (requested !== undefined && !sameWalletAddress('eip155', requested, bound)) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_WRONG_WALLET,
      `this escrow must be signed by ${bound} — the wallet that entered it on-chain`,
      { required_address: bound },
    )
  }
  return bound
}
