use anchor_lang::prelude::*;

use crate::errors::TendaError;
use crate::events::AssignmentReleased;
use crate::state::EscrowStatus;

use super::settlement_accounts::EscrowMutation;

/// Withdraw an assignment made by `assign_accept`, returning the escrow to
/// Open with funds untouched so it can be re-assigned.
///
/// `requires_approval` gates this: it is the on-chain witness that the worker
/// was PLACED rather than that they accepted. A worker who signed
/// `accept_escrow` themselves is therefore unreachable here, at any time.
/// Submitted work is excluded too, since that is a distinct status.
pub fn handler(ctx: Context<EscrowMutation>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(
        escrow.status == EscrowStatus::Accepted,
        TendaError::InvalidEscrowStatus
    );
    require!(escrow.requires_approval, TendaError::NotApprovalMode);
    require!(signer == escrow.creator, TendaError::NotCreator);

    let window_ends = escrow
        .accepted_at()
        .checked_add(escrow.unassign_window_seconds)
        .ok_or(TendaError::ArithmeticOverflow)?;
    require!(now < window_ends, TendaError::UnassignWindowClosed);

    // `Accepted` is only reachable with a counterparty set, on either path, so
    // this cannot fire — but it errors rather than defaulting, because
    // `unwrap_or_default()` would emit `Pubkey::default()` (all zeros) into the
    // event and the off-chain listener would resolve it to nobody. Matches how
    // every other handler reads this field.
    let released = escrow.counterparty.ok_or(TendaError::NotCounterparty)?;

    escrow.counterparty = None;
    escrow.status = EscrowStatus::Open;
    escrow.completion_deadline = 0;

    emit!(AssignmentReleased {
        escrow_id: escrow.escrow_id,
        counterparty: released,
        released_by: signer,
        timestamp: now,
    });
    Ok(())
}
