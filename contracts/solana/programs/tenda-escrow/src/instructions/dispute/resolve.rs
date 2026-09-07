//! `resolve_dispute_{sol,spl}` — `dispute_admin` distributes vault per winner.
//!
//! Vault holds principal + dispute_bond at this point. Distribution:
//!
//!   Winner::Creator      — creator gets principal; bond returned to raiser
//!                          if raiser==creator, else bond goes to creator
//!                          (raiser=counterparty lost).
//!   Winner::Counterparty — counterparty gets principal minus fee; treasury
//!                          gets fee; bond returned to raiser if
//!                          raiser==counterparty, else bond goes to
//!                          counterparty (raiser=creator lost).
//!   Winner::Split        — principal halved between creator & counterparty
//!                          (no fee taken); bond refunded to raiser.
//!
//! The raiser identity is NOT recorded on-chain (would require an extra
//! `raised_by: Pubkey` field on Escrow). To keep schema minimal we accept
//! the raiser as an instruction argument; the dispute_admin attests to it
//! based on off-chain dispute record (the listener cross-validates against
//! the `DisputeRaised` event's `raised_by` field).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{ESCROW_SEED, ESCROW_TOKEN_SEED, ESCROW_VAULT_SEED, PLATFORM_SEED};
use crate::errors::TendaError;
use crate::events::DisputeResolved;
use crate::instructions::escrow_state::settlement_accounts::compute_fee;
use crate::instructions::vault::transfer_lamports_from_vault;
use crate::state::{DisputeWinner, Escrow, EscrowStatus, PlatformState};

#[derive(Accounts)]
pub struct ResolveSol<'info> {
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
        has_one = dispute_admin @ TendaError::NotDisputeAdmin,
        has_one = treasury @ TendaError::TreasuryMismatch,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: lamport recipient — validated via escrow.creator.
    #[account(mut)]
    pub creator: AccountInfo<'info>,

    /// CHECK: lamport recipient — validated against escrow.counterparty.
    #[account(mut)]
    pub counterparty: AccountInfo<'info>,

    /// CHECK: lamport recipient — validated via platform_state.has_one.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub dispute_admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveSpl<'info> {
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
        has_one = dispute_admin @ TendaError::NotDisputeAdmin,
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

    /// CHECK: validated via escrow.creator.
    pub creator: AccountInfo<'info>,
    /// CHECK: validated against escrow.counterparty.
    pub counterparty: AccountInfo<'info>,
    /// CHECK: validated via platform_state.treasury.
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

    pub dispute_admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// Distribution of vault funds (principal + bond) computed by
/// `compute_distribution` given winner and raiser identity. At most one of
/// `bond_to_creator` / `bond_to_counterparty` is non-zero — never both.
struct Distribution {
    creator_payout: u64,
    counterparty_payout: u64,
    treasury_fee: u64,
    bond_to_creator: u64,
    bond_to_counterparty: u64,
    bond_refund_to: Option<Pubkey>,
}

fn compute_distribution(
    escrow: &Escrow,
    platform: &PlatformState,
    winner: DisputeWinner,
    raiser: Pubkey,
    counterparty: Pubkey,
) -> Result<Distribution> {
    let fee_bps = platform.effective_fee_bps(escrow.is_seeker);
    let bond = escrow.dispute_bond;

    match winner {
        DisputeWinner::Creator => {
            let bond_refund_to = if raiser == escrow.creator { Some(escrow.creator) } else { None };
            let (bond_to_creator, bond_to_counterparty) = if raiser == escrow.creator {
                (bond, 0)
            } else {
                // counterparty raised and lost — bond forfeit to creator.
                (bond, 0)
            };
            Ok(Distribution {
                creator_payout: escrow.amount,
                counterparty_payout: 0,
                treasury_fee: 0,
                bond_to_creator,
                bond_to_counterparty,
                bond_refund_to,
            })
        }
        DisputeWinner::Counterparty => {
            let fee = compute_fee(escrow.amount, fee_bps)?;
            let cp_payout = escrow
                .amount
                .checked_sub(fee)
                .ok_or(TendaError::ArithmeticUnderflow)?;
            let bond_refund_to = if raiser == counterparty { Some(counterparty) } else { None };
            let (bond_to_creator, bond_to_counterparty) = if raiser == counterparty {
                (0, bond)
            } else {
                // creator raised and lost — bond forfeit to counterparty.
                (0, bond)
            };
            Ok(Distribution {
                creator_payout: 0,
                counterparty_payout: cp_payout,
                treasury_fee: fee,
                bond_to_creator,
                bond_to_counterparty,
                bond_refund_to,
            })
        }
        DisputeWinner::Split => {
            let half = escrow.amount / 2;
            let other_half = escrow
                .amount
                .checked_sub(half)
                .ok_or(TendaError::ArithmeticUnderflow)?;
            let bond_refund_to = if raiser == escrow.creator {
                Some(escrow.creator)
            } else if raiser == counterparty {
                Some(counterparty)
            } else {
                None
            };
            let (bond_to_creator, bond_to_counterparty) = match bond_refund_to {
                Some(pk) if pk == escrow.creator => (bond, 0),
                Some(_) => (0, bond),
                None => (0, 0),
            };
            Ok(Distribution {
                creator_payout: half,
                counterparty_payout: other_half,
                treasury_fee: 0,
                bond_to_creator,
                bond_to_counterparty,
                bond_refund_to,
            })
        }
    }
}

pub fn handler_sol(
    ctx: Context<ResolveSol>,
    winner: DisputeWinner,
    raiser: Pubkey,
) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Disputed, TendaError::InvalidEscrowStatus);
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NotCounterparty)?;
    require_keys_eq!(
        ctx.accounts.counterparty.key(),
        counterparty,
        TendaError::NotCounterparty
    );
    require!(
        raiser == escrow.creator || raiser == counterparty,
        TendaError::NotDisputeParty
    );

    let dist = compute_distribution(escrow, &ctx.accounts.platform_state, winner, raiser, counterparty)?;

    let creator_total = dist
        .creator_payout
        .checked_add(dist.bond_to_creator)
        .ok_or(TendaError::ArithmeticOverflow)?;
    let counterparty_total = dist
        .counterparty_payout
        .checked_add(dist.bond_to_counterparty)
        .ok_or(TendaError::ArithmeticOverflow)?;

    let escrow_id = escrow.escrow_id;
    let vault_bump = escrow.vault_bump;
    if creator_total > 0 {
        transfer_lamports_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.creator,
            &ctx.accounts.system_program.to_account_info(),
            &escrow_id,
            vault_bump,
            creator_total,
        )?;
    }
    if counterparty_total > 0 {
        transfer_lamports_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.counterparty,
            &ctx.accounts.system_program.to_account_info(),
            &escrow_id,
            vault_bump,
            counterparty_total,
        )?;
    }
    if dist.treasury_fee > 0 {
        transfer_lamports_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.treasury,
            &ctx.accounts.system_program.to_account_info(),
            &escrow_id,
            vault_bump,
            dist.treasury_fee,
        )?;
    }

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Resolved;

    emit!(DisputeResolved {
        escrow_id: escrow.escrow_id,
        winner,
        creator_payout: dist.creator_payout,
        counterparty_payout: dist.counterparty_payout,
        platform_fee: dist.treasury_fee,
        bond_refund_to: dist.bond_refund_to,
        bond_amount: escrow.dispute_bond,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn handler_spl(
    ctx: Context<ResolveSpl>,
    winner: DisputeWinner,
    raiser: Pubkey,
) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Disputed, TendaError::InvalidEscrowStatus);
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NotCounterparty)?;
    require_keys_eq!(
        ctx.accounts.counterparty_token_account.owner,
        counterparty,
        TendaError::TokenAccountMismatch
    );
    require!(
        raiser == escrow.creator || raiser == counterparty,
        TendaError::NotDisputeParty
    );

    let dist = compute_distribution(escrow, &ctx.accounts.platform_state, winner, raiser, counterparty)?;

    let escrow_id = escrow.escrow_id;
    let bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_SEED, escrow_id.as_ref(), &[bump]]];

    let creator_total = dist
        .creator_payout
        .checked_add(dist.bond_to_creator)
        .ok_or(TendaError::ArithmeticOverflow)?;
    let counterparty_total = dist
        .counterparty_payout
        .checked_add(dist.bond_to_counterparty)
        .ok_or(TendaError::ArithmeticOverflow)?;

    if creator_total > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            creator_total,
        )?;
    }
    if counterparty_total > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.counterparty_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            counterparty_total,
        )?;
    }
    if dist.treasury_fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            dist.treasury_fee,
        )?;
    }

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Resolved;

    emit!(DisputeResolved {
        escrow_id: escrow.escrow_id,
        winner,
        creator_payout: dist.creator_payout,
        counterparty_payout: dist.counterparty_payout,
        platform_fee: dist.treasury_fee,
        bond_refund_to: dist.bond_refund_to,
        bond_amount: escrow.dispute_bond,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
