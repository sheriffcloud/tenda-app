// SPDX-License-Identifier: Apache-2.0
//! `dispute_escrow_{sol,spl}` — either party raises a dispute against an
//! Accepted or Submitted escrow. Raiser funds the bond into the same vault
//! as the principal. Status -> Disputed.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{ESCROW_SEED, ESCROW_TOKEN_SEED, ESCROW_VAULT_SEED};
use crate::errors::TendaError;
use crate::events::DisputeRaised;
use crate::instructions::vault::fund_vault_from_signer;
use crate::state::{Escrow, EscrowStatus};

#[derive(Accounts)]
pub struct DisputeSol<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub raiser: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DisputeSpl<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.escrow_id.as_ref()],
        bump = escrow.bump,
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
        constraint = raiser_token_account.mint == escrow.asset @ TendaError::MintMismatch,
        constraint = raiser_token_account.owner == raiser.key() @ TendaError::TokenAccountMismatch,
    )]
    pub raiser_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub raiser: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

fn assert_dispute_party(escrow: &Escrow, raiser: Pubkey) -> Result<()> {
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NoCounterpartyForDispute)?;
    require!(
        raiser == escrow.creator || raiser == counterparty,
        TendaError::NotDisputeParty
    );
    Ok(())
}

fn assert_disputable_status(escrow: &Escrow) -> Result<EscrowStatus> {
    match escrow.status {
        EscrowStatus::Accepted | EscrowStatus::Submitted => Ok(escrow.status),
        _ => err!(TendaError::InvalidEscrowStatus),
    }
}

pub fn handler_sol(ctx: Context<DisputeSol>, bond_amount: u64) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let raiser = ctx.accounts.raiser.key();
    assert_dispute_party(escrow, raiser)?;
    let from_status = assert_disputable_status(escrow)?;
    require!(
        bond_amount == escrow.dispute_bond,
        TendaError::DisputeBondMismatch
    );

    fund_vault_from_signer(
        &ctx.accounts.raiser.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        bond_amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Disputed;

    emit!(DisputeRaised {
        escrow_id: escrow.escrow_id,
        raised_by: raiser,
        from_status,
        bond_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn handler_spl(ctx: Context<DisputeSpl>, bond_amount: u64) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let raiser = ctx.accounts.raiser.key();
    assert_dispute_party(escrow, raiser)?;
    let from_status = assert_disputable_status(escrow)?;
    require!(
        bond_amount == escrow.dispute_bond,
        TendaError::DisputeBondMismatch
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.raiser_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.raiser.to_account_info(),
            },
        ),
        bond_amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Disputed;

    emit!(DisputeRaised {
        escrow_id: escrow.escrow_id,
        raised_by: raiser,
        from_status,
        bond_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
