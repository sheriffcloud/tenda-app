// SPDX-License-Identifier: Apache-2.0
//! Vault transfer helpers shared by all settlement paths.
//!
//! Native SOL escrows hold lamports on a system-owned PDA derived from
//! `[ESCROW_VAULT_SEED, escrow_id]`. The vault stays owned by the System
//! Program, so this program may never debit its lamports directly — the
//! runtime rejects lamport decreases on accounts the executing program does
//! not own (`ExternalAccountLamportSpend`). Settlement therefore CPIs into
//! `system_program::transfer` with the vault PDA's signer seeds via
//! `invoke_signed`.
//!
//! SPL escrows hold tokens in a Token Program account owned by the Escrow
//! data PDA (the data PDA is the `authority`). Settlement uses `token::transfer`
//! with PDA signer seeds.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::ESCROW_VAULT_SEED;
use crate::errors::TendaError;

/// Move lamports out of the per-escrow SOL vault PDA to a recipient via
/// `system_program::transfer`, PDA-signed with the vault's seeds. Both
/// accounts must be writable.
///
/// The vault must hold at least `amount`. Settlement paths drain the vault
/// to exactly zero across an instruction (zero-balance accounts are exempt
/// from the rent-minimum check), so no rent dust is ever stranded.
pub fn transfer_lamports_from_vault<'info>(
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    escrow_id: &[u8; 16],
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    require!(vault.lamports() >= amount, TendaError::VaultUnderfunded);

    let bump_seed = [vault_bump];
    let seeds: &[&[u8]] = &[ESCROW_VAULT_SEED, escrow_id.as_ref(), &bump_seed];
    let signer_seeds = [seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        system_program.clone(),
        system_program::Transfer {
            from: vault.clone(),
            to: to.clone(),
        },
        &signer_seeds,
    );
    system_program::transfer(cpi_ctx, amount)
}

/// Move lamports from a signer (creator paying into the vault at create time)
/// using `system_program::transfer`. Used by `create_escrow_sol` to fund the
/// vault and by `dispute_escrow_sol` to add the bond.
pub fn fund_vault_from_signer<'info>(
    signer: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let cpi_ctx = CpiContext::new(
        system_program.clone(),
        system_program::Transfer {
            from: signer.clone(),
            to: vault.clone(),
        },
    );
    system_program::transfer(cpi_ctx, amount)
}
