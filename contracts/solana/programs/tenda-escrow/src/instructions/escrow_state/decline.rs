use anchor_lang::prelude::*;

use crate::errors::TendaError;
use crate::events::EscrowDeclined;
use crate::state::EscrowStatus;

use super::settlement_accounts::EscrowMutation;

pub fn handler(ctx: Context<EscrowMutation>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(escrow.status == EscrowStatus::Open, TendaError::InvalidEscrowStatus);
    let assigned = escrow
        .assigned_counterparty
        .ok_or(TendaError::NoAssignedCounterparty)?;
    require!(signer == assigned, TendaError::NotAssignedCounterparty);

    escrow.assigned_counterparty = None;

    emit!(EscrowDeclined {
        escrow_id: escrow.escrow_id,
        declined_by: signer,
        timestamp: now,
    });
    Ok(())
}
