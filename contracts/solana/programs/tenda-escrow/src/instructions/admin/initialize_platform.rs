// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::constants::{
    MAX_APPROVAL_WINDOW_SECONDS, MAX_GRACE_PERIOD_SECONDS, MAX_PLATFORM_FEE_BPS,
    MIN_APPROVAL_WINDOW_SECONDS, MIN_GRACE_PERIOD_SECONDS, PLATFORM_SEED,
};
use crate::errors::TendaError;
use crate::events::PlatformInitialized;
use crate::state::PlatformState;

use super::require_authority;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializePlatformArgs {
    pub protocol_admin: Pubkey,
    pub dispute_admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub seeker_fee_bps: u16,
    pub approval_window_seconds: i64,
    pub grace_period_seconds: i64,
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = payer,
        space = PlatformState::LEN,
        seeds = [PLATFORM_SEED],
        bump,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// The program's OWN ProgramData account — where the upgrade authority set
    /// by `solana program deploy` lives.
    ///
    /// Solana has no constructor: `initialize_platform` is necessarily a
    /// separate transaction from the deploy, so without this gate the first
    /// caller after a deploy wins and names themselves protocol_admin,
    /// dispute_admin and treasury — taking every fee and the power to resolve
    /// disputes, which moves escrowed user funds. It is irrecoverable
    /// (`close_legacy_platform` cannot touch a current-length PDA, and every
    /// `set_*` needs the incumbent admin), so the gate belongs on-chain rather
    /// than in a "run init quickly" operational note.
    ///
    /// Unforgeable on both halves: the ADDRESS is derived from this program's
    /// id under the upgradeable loader, and `Account<ProgramData>` requires that
    /// loader to own it.
    ///
    /// NOTE: a program whose upgrade authority has been removed (made immutable)
    /// carries `None` here and can never be initialized — so initialize BEFORE
    /// making the program immutable.
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = program_data.upgrade_authority_address == Some(payer.key())
            @ TendaError::NotUpgradeAuthority,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_platform_handler(
    ctx: Context<InitializePlatform>,
    args: InitializePlatformArgs,
) -> Result<()> {
    require_authority(&args.protocol_admin)?;
    require_authority(&args.dispute_admin)?;
    require_authority(&args.treasury)?;
    validate_fee_bps(args.fee_bps, args.seeker_fee_bps)?;
    validate_window(args.approval_window_seconds)?;
    validate_grace(args.grace_period_seconds)?;

    let state = &mut ctx.accounts.platform_state;
    state.protocol_admin = args.protocol_admin;
    state.dispute_admin = args.dispute_admin;
    state.treasury = args.treasury;
    state.fee_bps = args.fee_bps;
    state.seeker_fee_bps = args.seeker_fee_bps;
    state.approval_window_seconds = args.approval_window_seconds;
    state.grace_period_seconds = args.grace_period_seconds;
    state.bump = ctx.bumps.platform_state;

    let now = Clock::get()?.unix_timestamp;
    emit!(PlatformInitialized {
        protocol_admin: state.protocol_admin,
        dispute_admin: state.dispute_admin,
        treasury: state.treasury,
        fee_bps: state.fee_bps,
        seeker_fee_bps: state.seeker_fee_bps,
        approval_window_seconds: state.approval_window_seconds,
        grace_period_seconds: state.grace_period_seconds,
        timestamp: now,
    });
    Ok(())
}

pub(crate) fn validate_fee_bps(fee_bps: u16, seeker_fee_bps: u16) -> Result<()> {
    require!(
        fee_bps <= MAX_PLATFORM_FEE_BPS,
        TendaError::PlatformFeeTooHigh
    );
    require!(
        seeker_fee_bps <= fee_bps,
        TendaError::SeekerFeeExceedsStandardFee
    );
    Ok(())
}

pub(crate) fn validate_window(seconds: i64) -> Result<()> {
    require!(
        (MIN_APPROVAL_WINDOW_SECONDS..=MAX_APPROVAL_WINDOW_SECONDS).contains(&seconds),
        TendaError::ApprovalWindowOutOfRange
    );
    Ok(())
}

pub(crate) fn validate_grace(seconds: i64) -> Result<()> {
    require!(
        (MIN_GRACE_PERIOD_SECONDS..=MAX_GRACE_PERIOD_SECONDS).contains(&seconds),
        TendaError::GracePeriodOutOfRange
    );
    Ok(())
}
