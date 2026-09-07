// Managed by scripts/sync-abi.mjs — re-run after every `forge build`
import _RAW from './tenda_escrow_evm.json'

/**
 * Compiled ABI for the TendaEscrow EVM contract (tenda-escrow-evm).
 * Consumers (server viem adapter, mobile tx validation) narrow it to
 * viem's `Abi` at their boundary — shared stays viem-free.
 */
export const TENDA_ESCROW_EVM_ABI = _RAW.abi

export const TENDA_ESCROW_EVM_CONTRACT_NAME = _RAW.contractName
