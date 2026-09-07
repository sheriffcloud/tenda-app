// SPDX-License-Identifier: Apache-2.0
//! `approve_completion_{sol,spl}` — creator releases payment to counterparty
//! and platform fee to treasury. Status -> Completed. Callable any time
//! during Submitted (before or after approval_deadline).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::constants::ESCROW_SEED;
use crate::errors::TendaError;
use crate::events::EscrowApproved;
use crate::instructions::vault::transfer_lamports_from_vault;
use crate::state::EscrowStatus;

use super::settlement_accounts::{compute_fee, SettleSol, SettleSpl};

pub fn handler_sol(ctx: Context<SettleSol>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(
        escrow.status == EscrowStatus::Submitted,
        TendaError::InvalidEscrowStatus
    );
    require!(
        ctx.accounts.signer.key() == escrow.creator,
        TendaError::NotCreator
    );

    let counterparty = escrow.counterparty.ok_or(TendaError::NotCounterparty)?;
    require_keys_eq!(
        ctx.accounts.counterparty.key(),
        counterparty,
        TendaError::NotCounterparty
    );

    let fee = compute_fee(
        escrow.amount,
        ctx.accounts
            .platform_state
            .effective_fee_bps(escrow.is_seeker),
    )?;
    let counterparty_payout = escrow
        .amount
        .checked_sub(fee)
        .ok_or(TendaError::ArithmeticUnderflow)?;

    let escrow_id = escrow.escrow_id;
    let vault_bump = escrow.vault_bump;
    transfer_lamports_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.counterparty,
        &ctx.accounts.system_program.to_account_info(),
        &escrow_id,
        vault_bump,
        counterparty_payout,
    )?;
    transfer_lamports_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.treasury,
        &ctx.accounts.system_program.to_account_info(),
        &escrow_id,
        vault_bump,
        fee,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Completed;

    emit!(EscrowApproved {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        counterparty,
        amount: counterparty_payout,
        platform_fee: fee,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn handler_spl(ctx: Context<SettleSpl>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(
        escrow.status == EscrowStatus::Submitted,
        TendaError::InvalidEscrowStatus
    );
    require!(
        ctx.accounts.signer.key() == escrow.creator,
        TendaError::NotCreator
    );

    let counterparty = escrow.counterparty.ok_or(TendaError::NotCounterparty)?;
    require_keys_eq!(
        ctx.accounts.counterparty.key(),
        counterparty,
        TendaError::NotCounterparty
    );
    require_keys_eq!(
        ctx.accounts.counterparty_token_account.owner,
        counterparty,
        TendaError::TokenAccountMismatch
    );

    let fee_bps = ctx
        .accounts
        .platform_state
        .effective_fee_bps(escrow.is_seeker);
    let fee = compute_fee(escrow.amount, fee_bps)?;
    let counterparty_payout = escrow
        .amount
        .checked_sub(fee)
        .ok_or(TendaError::ArithmeticUnderflow)?;

    let escrow_id = escrow.escrow_id;
    let bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_SEED, escrow_id.as_ref(), &[bump]]];

    let cpi_counterparty = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.counterparty_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_counterparty, counterparty_payout)?;

    let cpi_treasury = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_treasury, fee)?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Completed;

    emit!(EscrowApproved {
        escrow_id: escrow.escrow_id,
        creator: escrow.creator,
        counterparty,
        amount: counterparty_payout,
        platform_fee: fee,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
