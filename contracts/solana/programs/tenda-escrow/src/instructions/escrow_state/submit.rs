use anchor_lang::prelude::*;

use crate::errors::TendaError;
use crate::events::ProofSubmitted;
use crate::state::EscrowStatus;

use super::settlement_accounts::EscrowMutation;

pub fn handler(ctx: Context<EscrowMutation>, proof_hash: [u8; 32]) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(escrow.status == EscrowStatus::Accepted, TendaError::InvalidEscrowStatus);
    let counterparty = escrow
        .counterparty
        .ok_or(TendaError::NotCounterparty)?;
    require!(signer == counterparty, TendaError::NotCounterparty);

    let grace = ctx.accounts.platform_state.grace_period_seconds;
    let submit_cutoff = escrow
        .completion_deadline
        .checked_add(grace)
        .ok_or(TendaError::ArithmeticOverflow)?;
    require!(now < submit_cutoff, TendaError::SubmissionWindowClosed);

    let approval_window = ctx.accounts.platform_state.approval_window_seconds;
    escrow.approval_deadline = now
        .checked_add(approval_window)
        .ok_or(TendaError::ArithmeticOverflow)?;
    escrow.status = EscrowStatus::Submitted;

    emit!(ProofSubmitted {
        escrow_id: escrow.escrow_id,
        counterparty: signer,
        approval_deadline: escrow.approval_deadline,
        proof_hash,
        timestamp: now,
    });
    Ok(())
}
