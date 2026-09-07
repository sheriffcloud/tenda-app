// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::PLATFORM_SEED;
use crate::errors::TendaError;
use crate::state::PlatformState;

/// Close a STALE platform PDA left behind by a pre-rewrite deployment at
/// the same program id (devnet migration path).
///
/// Safety: the only guard that matters is the size check in the handler —
/// a CURRENT-layout platform account is exactly `PlatformState::LEN` bytes
/// and can therefore NEVER be closed through this instruction, no matter
/// who signs. The program has no realloc path for the platform account, so
/// the length cannot be forged. On a fresh deployment (mainnet) this
/// instruction is a permanent no-op: the PDA either doesn't exist or is
/// current-layout.
///
/// Permissionless by design: the legacy account predates the current admin
/// config, so there is no on-chain authority to anchor a signer check to.
/// Closing it only ever unblocks `initialize_platform`; reclaimed rent
/// goes to whoever paid the tx fee.
#[derive(Accounts)]
pub struct CloseLegacyPlatform<'info> {
    /// CHECK: raw on purpose — the legacy layout cannot deserialize as
    /// `PlatformState`; the handler enforces ownership and the size guard.
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump,
    )]
    pub platform_raw: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

pub fn close_legacy_platform_handler(ctx: Context<CloseLegacyPlatform>) -> Result<()> {
    let info = ctx.accounts.platform_raw.to_account_info();

    // Seeds pin the address; ownership pins it to this program (a PDA at
    // our seeds could in principle be system-owned and empty).
    require!(info.owner == &crate::ID, TendaError::PlatformLayoutCurrent);
    // The one guard that matters: current-layout platforms are untouchable.
    require!(
        info.data_len() != PlatformState::LEN,
        TendaError::PlatformLayoutCurrent
    );

    // Standard close: drain lamports, wipe data, hand back to the system
    // program so `initialize_platform`'s `init` can re-create the PDA.
    let payer = ctx.accounts.payer.to_account_info();
    **payer.try_borrow_mut_lamports()? += info.lamports();
    **info.try_borrow_mut_lamports()? = 0;
    info.assign(&system_program::ID);
    info.resize(0)?;

    Ok(())
}
