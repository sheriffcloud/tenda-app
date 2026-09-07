use anchor_lang::prelude::*;

use crate::constants::{
    MAX_APPROVAL_WINDOW_SECONDS, MAX_GRACE_PERIOD_SECONDS, MAX_PLATFORM_FEE_BPS,
    MIN_APPROVAL_WINDOW_SECONDS, MIN_GRACE_PERIOD_SECONDS, PLATFORM_SEED,
};
use crate::errors::TendaError;
use crate::events::PlatformInitialized;
use crate::state::PlatformState;

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

    pub system_program: Program<'info, System>,
}

pub fn initialize_platform_handler(ctx: Context<InitializePlatform>, args: InitializePlatformArgs) -> Result<()> {
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
    state.total_volume = 0;
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
    require!(fee_bps <= MAX_PLATFORM_FEE_BPS, TendaError::PlatformFeeTooHigh);
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
