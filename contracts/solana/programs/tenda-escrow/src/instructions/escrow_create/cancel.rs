// SPDX-License-Identifier: Apache-2.0
//! `cancel_escrow_{sol,spl}` — creator unwinds an Open escrow before any
//! counterparty has accepted. Refunds the full amount to the creator. No
//! platform fee (nothing was delivered).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{ESCROW_SEED, ESCROW_TOKEN_SEED, ESCROW_VAULT_SEED};
use crate::errors::TendaError;
use crate::events::EscrowCancelled;
use crate::instructions::vault::transfer_lamports_from_vault;
use crate::state::{Escrow, EscrowStatus};

#[derive(Accounts)]
pub struct CancelSol<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
        has_one = creator @ TendaError::NotCreator,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSpl<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
        has_one = creator @ TendaError::NotCreator,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [ESCROW_TOKEN_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
        constraint = vault_token_account.mint == escrow.asset @ TendaError::MintMismatch,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.mint == escrow.asset @ TendaError::MintMismatch,
        constraint = creator_token_account.owner == creator.key() @ TendaError::TokenAccountMismatch,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_sol(ctx: Context<CancelSol>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(
        escrow.status == EscrowStatus::Open,
        TendaError::InvalidEscrowStatus
    );

    let amount = escrow.amount;
    let escrow_id = escrow.escrow_id;
    let vault_bump = escrow.vault_bump;
    transfer_lamports_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &escrow_id,
        vault_bump,
        amount,
    )?;
    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Cancelled;

    emit!(EscrowCancelled {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        refund_amount: amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn handler_spl(ctx: Context<CancelSpl>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(
        escrow.status == EscrowStatus::Open,
        TendaError::InvalidEscrowStatus
    );

    let amount = escrow.amount;
    let escrow_id = escrow.escrow_id;
    let bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_SEED, escrow_id.as_ref(), &[bump]]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.creator_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Cancelled;

    emit!(EscrowCancelled {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        refund_amount: amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
