// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

use crate::errors::TendaError;
use crate::events::CounterpartyAssigned;
use crate::state::EscrowStatus;

use super::settlement_accounts::EscrowMutation;

/// Approval mode: the creator picks a worker and moves the escrow to Accepted
/// in one instruction, so the worker signs nothing to start (their only
/// transaction is `submit_proof`).
///
/// Deliberately the exact state change `accept_escrow` makes, minus the
/// worker's signature — the two modes must not diverge downstream.
pub fn handler(ctx: Context<EscrowMutation>, worker: Pubkey) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(
        escrow.status == EscrowStatus::Open,
        TendaError::InvalidEscrowStatus
    );
    require!(escrow.requires_approval, TendaError::NotApprovalMode);
    require!(signer == escrow.creator, TendaError::NotCreator);
    // Every other instruction learns the counterparty from a Signer, which
    // cannot be the zero pubkey. Here it arrives as an ARGUMENT, so it is the
    // one place the default pubkey can slip in — and it would move the escrow
    // to Accepted with a counterparty nobody holds the key to: no submit, no
    // payout, and an `accepted` DB row whose counterparty resolves to nobody.
    require!(worker != Pubkey::default(), TendaError::ZeroCounterparty);
    require!(worker != escrow.creator, TendaError::CannotAssignCreator);
    require!(
        now < escrow.accept_deadline,
        TendaError::AcceptDeadlinePassed
    );

    escrow.counterparty = Some(worker);
    escrow.status = EscrowStatus::Accepted;
    escrow.completion_deadline = now
        .checked_add(escrow.completion_duration_seconds)
        .ok_or(TendaError::ArithmeticOverflow)?;

    emit!(CounterpartyAssigned {
        escrow_id: escrow.escrow_id,
        counterparty: worker,
        assigned_by: signer,
        completion_deadline: escrow.completion_deadline,
        timestamp: now,
    });
    Ok(())
}
