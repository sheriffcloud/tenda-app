use anchor_lang::prelude::*;

use crate::errors::TendaError;
use crate::events::EscrowAccepted;
use crate::state::EscrowStatus;

use super::settlement_accounts::EscrowMutation;

pub fn handler(ctx: Context<EscrowMutation>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(escrow.status == EscrowStatus::Open, TendaError::InvalidEscrowStatus);
    require!(!escrow.requires_approval, TendaError::ApprovalRequired);
    require!(signer != escrow.creator, TendaError::CreatorCannotAccept);
    require!(now < escrow.accept_deadline, TendaError::AcceptDeadlinePassed);

    if let Some(assigned) = escrow.assigned_counterparty {
        require!(signer == assigned, TendaError::NotAssignedCounterparty);
    }

    escrow.counterparty = Some(signer);
    escrow.status = EscrowStatus::Accepted;
    escrow.completion_deadline = now
        .checked_add(escrow.completion_duration_seconds)
        .ok_or(TendaError::ArithmeticOverflow)?;

    emit!(EscrowAccepted {
        escrow_id: escrow.escrow_id,
        counterparty: signer,
        completion_deadline: escrow.completion_deadline,
        timestamp: now,
    });
    Ok(())
}
