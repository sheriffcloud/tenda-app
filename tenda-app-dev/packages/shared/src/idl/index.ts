// Managed by scripts/sync-idl.mjs — re-run after every `anchor build`
import _RAW from './tenda_escrow.json'
import type { TendaEscrow } from './tenda_escrow'

/** Compiled IDL for the Tenda Escrow program. Used by server (Anchor Program) and mobile (tx validation). */
// The double cast is the standard Anchor pattern: JSON imports widen literal
// types, so the raw module can't satisfy the literal-typed `TendaEscrow`.
export const ESCROW_IDL = _RAW as unknown as TendaEscrow

export type { TendaEscrow }

/**
 * Union of all valid instruction names, derived from the generated IDL type
 * (camelCase, e.g. `'acceptEscrow'`). Derivation means a fresh `anchor build`
 * + sync can never drift from this type.
 */
export type InstructionName = TendaEscrow['instructions'][number]['name']

/**
 * Union of all event names, derived from the generated IDL type (camelCase,
 * e.g. `'escrowCreated'`).
 */
export type IdlEventName = TendaEscrow['events'][number]['name']

/** snake_case (IDL JSON) → camelCase (generated type) name normalizer. */
function camelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Returns the 8-byte Anchor discriminator for the named instruction as a
 * plain number array. Portable across server (wrap with Buffer.from) and mobile.
 *
 * The IDL JSON stores snake_case names while the generated type (and this
 * function's parameter) uses camelCase — the lookup normalizes.
 *
 * Throws if the instruction name is not found in the IDL — catches drift
 * between a stale JSON and the generated type at dev time.
 */
export function discriminatorFor(instructionName: InstructionName): number[] {
  const instructions = (
    _RAW as { instructions: Array<{ name: string; discriminator: number[] }> }
  ).instructions
  const ix = instructions.find((i) => camelCase(i.name) === instructionName)
  if (!ix) throw new Error(`Unknown instruction: ${instructionName}`)
  return ix.discriminator
}
