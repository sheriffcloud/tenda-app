//! Shared `#[derive(Accounts)]` structs for state-machine + settlement paths.
//!
//! `EscrowMutation` — no funds move, signer can be either party (each handler
//! enforces its own creator/counterparty rule).
//!
//! `SettleSol` / `SettleSpl` — funds move from vault. Recipient + creator
//! pubkeys are validated against `escrow` via `has_one`. PlatformState +
//! treasury are present for fee disbursement.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{ESCROW_SEED, ESCROW_TOKEN_SEED, ESCROW_VAULT_SEED, PLATFORM_SEED};
use crate::errors::TendaError;
use crate::state::{Escrow, PlatformState};

/// State-only mutation — accept, decline, submit. No vault touch.
#[derive(Accounts)]
pub struct EscrowMutation<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_state.bump,
    )]
    pub platform_state: Account<'info, PlatformState>,

    pub signer: Signer<'info>,
}

/// SOL settlement — vault → (creator or counterparty + treasury).
/// Counterparty + creator both writable so either can receive lamports
/// without further account-loading work in the handler. The treasury also
/// writable for fee deposit.
#[derive(Accounts)]
pub struct SettleSol<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
        has_one = creator @ TendaError::NotCreator,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_state.bump,
        has_one = treasury @ TendaError::TreasuryMismatch,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: writable lamport recipient — validated via `escrow.creator`.
    #[account(mut)]
    pub creator: AccountInfo<'info>,

    /// CHECK: writable lamport recipient — validated in the handler against
    /// `escrow.counterparty` (cannot use `has_one` because the field is an
    /// Option). Handlers that don't pay counterparty (e.g. reclaim) must
    /// still pass the correct account to satisfy this struct; in those cases
    /// we just don't transfer anything to it.
    #[account(mut)]
    pub counterparty: AccountInfo<'info>,

    /// CHECK: writable lamport recipient — validated by `platform_state.has_one`.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// SPL settlement — vault_token_account → (creator_ata or counterparty_ata + treasury_ata).
#[derive(Accounts)]
pub struct SettleSpl<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
        has_one = creator @ TendaError::NotCreator,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_state.bump,
        has_one = treasury @ TendaError::TreasuryMismatch,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        mut,
        seeds = [ESCROW_TOKEN_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
        constraint = vault_token_account.mint == escrow.asset @ TendaError::MintMismatch,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: address-only validation via `escrow.creator`.
    pub creator: AccountInfo<'info>,

    /// CHECK: address-only validation via `escrow.counterparty` in handler.
    pub counterparty: AccountInfo<'info>,

    /// CHECK: address-only validation via `platform_state.treasury`.
    pub treasury: AccountInfo<'info>,

    #[account(
        mut,
        constraint = creator_token_account.mint == escrow.asset @ TendaError::MintMismatch,
        constraint = creator_token_account.owner == creator.key() @ TendaError::TokenAccountMismatch,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = counterparty_token_account.mint == escrow.asset @ TendaError::MintMismatch,
    )]
    pub counterparty_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = treasury_token_account.mint == escrow.asset @ TendaError::MintMismatch,
        constraint = treasury_token_account.owner == treasury.key() @ TendaError::TokenAccountMismatch,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub signer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// SPL reclaim — vault_token_account → creator_ata only.
///
/// Split out of `SettleSpl` because `reclaim_abandoned_spl` refunds *only* the
/// creator (counterparty ghosted past grace, no fee). Sharing `SettleSpl`
/// would force Anchor to deserialize the counterparty + treasury token
/// accounts it never touches, which in turn forces the client to provision
/// (and rent) those ATAs for no reason. This tight struct declares just the
/// vault and the creator's ATA, so no phantom ATA is ever required or created.
/// No `has_one = treasury` on platform_state either — reclaim takes no fee.
#[derive(Accounts)]
pub struct ReclaimSpl<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
        has_one = creator @ TendaError::NotCreator,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_state.bump,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        mut,
        seeds = [ESCROW_TOKEN_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
        constraint = vault_token_account.mint == escrow.asset @ TendaError::MintMismatch,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: address-only validation via `escrow.creator`.
    pub creator: AccountInfo<'info>,

    #[account(
        mut,
        constraint = creator_token_account.mint == escrow.asset @ TendaError::MintMismatch,
        constraint = creator_token_account.owner == creator.key() @ TendaError::TokenAccountMismatch,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub signer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// Shared fee math — mirrors `lib/escrow.ts:computePlatformFee` bit-for-bit
/// (floor division, no rounding). Single source of truth on-chain.
pub fn compute_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    let product = amount
        .checked_mul(fee_bps as u64)
        .ok_or(TendaError::ArithmeticOverflow)?;
    Ok(product / 10_000)
}
