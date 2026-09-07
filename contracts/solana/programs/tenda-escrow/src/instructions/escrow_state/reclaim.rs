//! `reclaim_abandoned_{sol,spl}` — creator pulls refund when counterparty
//! accepted but never submitted within `completion_deadline + grace`. Full
//! refund (no fee). Emits standing-signal event the listener uses to apply
//! a reputation cooldown against counterparty.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::constants::ESCROW_SEED;
use crate::errors::TendaError;
use crate::events::EscrowAbandoned;
use crate::instructions::vault::transfer_lamports_from_vault;
use crate::state::EscrowStatus;

use super::settlement_accounts::{ReclaimSpl, SettleSol};

pub fn handler_sol(ctx: Context<SettleSol>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Accepted, TendaError::InvalidEscrowStatus);
    require!(ctx.accounts.signer.key() == escrow.creator, TendaError::NotCreator);
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NotCounterparty)?;

    let now = Clock::get()?.unix_timestamp;
    let grace = ctx.accounts.platform_state.grace_period_seconds;
    let reclaim_at = escrow
        .completion_deadline
        .checked_add(grace)
        .ok_or(TendaError::ArithmeticOverflow)?;
    require!(now >= reclaim_at, TendaError::ReclaimWindowNotOpen);

    let amount = escrow.amount;
    let escrow_id = escrow.escrow_id;
    let vault_bump = escrow.vault_bump;
    transfer_lamports_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.creator,
        &ctx.accounts.system_program.to_account_info(),
        &escrow_id,
        vault_bump,
        amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Refunded;

    emit!(EscrowAbandoned {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        counterparty,
        refund_amount: amount,
        timestamp: now,
    });
    Ok(())
}

pub fn handler_spl(ctx: Context<ReclaimSpl>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == EscrowStatus::Accepted, TendaError::InvalidEscrowStatus);
    require!(ctx.accounts.signer.key() == escrow.creator, TendaError::NotCreator);
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NotCounterparty)?;

    let now = Clock::get()?.unix_timestamp;
    let grace = ctx.accounts.platform_state.grace_period_seconds;
    let reclaim_at = escrow
        .completion_deadline
        .checked_add(grace)
        .ok_or(TendaError::ArithmeticOverflow)?;
    require!(now >= reclaim_at, TendaError::ReclaimWindowNotOpen);

    let amount = escrow.amount;
    let escrow_id = escrow.escrow_id;
    let bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_SEED, escrow_id.as_ref(), &[bump]]];

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
        amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Refunded;

    emit!(EscrowAbandoned {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        counterparty,
        refund_amount: amount,
        timestamp: now,
    });
    Ok(())
}
