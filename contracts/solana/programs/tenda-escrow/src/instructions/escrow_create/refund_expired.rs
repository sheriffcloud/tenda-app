//! `refund_expired_{sol,spl}` — Open escrow that nobody accepted past its
//! accept_deadline. Creator pulls a full refund. No counterparty, no
//! reputation signal.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::constants::ESCROW_SEED;
use crate::errors::TendaError;
use crate::events::EscrowExpired;
use crate::instructions::vault::transfer_lamports_from_vault;
use crate::state::EscrowStatus;

use super::cancel::{CancelSol as SettleSol, CancelSpl as SettleSpl};

pub fn handler_sol(ctx: Context<SettleSol>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Open, TendaError::InvalidEscrowStatus);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= escrow.accept_deadline,
        TendaError::AcceptDeadlineNotPassed
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
    escrow.status = EscrowStatus::Refunded;

    emit!(EscrowExpired {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        refund_amount: amount,
        timestamp: now,
    });
    Ok(())
}

pub fn handler_spl(ctx: Context<SettleSpl>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Open, TendaError::InvalidEscrowStatus);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= escrow.accept_deadline,
        TendaError::AcceptDeadlineNotPassed
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
    escrow.status = EscrowStatus::Refunded;

    emit!(EscrowExpired {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        refund_amount: amount,
        timestamp: now,
    });
    Ok(())
}
