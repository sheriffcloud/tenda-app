// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

use crate::constants::{
    MAX_COMPLETION_DURATION_SECONDS, MAX_UNASSIGN_WINDOW_SECONDS, MIN_COMPLETION_DURATION_SECONDS,
    MIN_ESCROW_AMOUNT, MIN_UNASSIGN_WINDOW_SECONDS,
};
use crate::errors::TendaError;
use crate::state::{Escrow, EscrowKind, EscrowStatus};

/// Args shared by `create_escrow_sol` and `create_escrow_spl`. Both paths
/// validate identically; the only difference is which account-set the runtime
/// produces (lamport vault vs. SPL token account).
///
/// `accept_deadline` is absolute Unix seconds (matches what the server already
/// produces — no client-side relative-time computation). `completion_duration`
/// is relative because completion_deadline is computed at accept-time, not
/// create-time.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateEscrowArgs {
    pub escrow_id: [u8; 16],
    pub kind: EscrowKind,
    pub amount: u64,
    pub assigned_counterparty: Option<Pubkey>,
    pub accept_deadline: i64,
    pub completion_duration_seconds: i64,
    pub dispute_bond: u64,
    pub is_seeker: bool,
    /// Acceptance mode. See `Escrow::requires_approval`.
    pub requires_approval: bool,
    /// See `Escrow::unassign_window_seconds`.
    pub unassign_window_seconds: i64,
}

impl CreateEscrowArgs {
    /// Caller-side input validation. Runs from both create paths before any
    /// state writes.
    pub fn validate(&self, now: i64) -> Result<()> {
        require!(self.amount >= MIN_ESCROW_AMOUNT, TendaError::AmountTooLow);
        require!(self.accept_deadline > now, TendaError::AcceptDeadlineInPast);
        require!(
            (MIN_COMPLETION_DURATION_SECONDS..=MAX_COMPLETION_DURATION_SECONDS)
                .contains(&self.completion_duration_seconds),
            TendaError::CompletionDurationOutOfRange
        );
        require!(
            (MIN_UNASSIGN_WINDOW_SECONDS..=MAX_UNASSIGN_WINDOW_SECONDS)
                .contains(&self.unassign_window_seconds),
            TendaError::UnassignWindowOutOfRange
        );
        // The three acceptance modes are mutually exclusive. Pre-assigning a
        // worker AND demanding approval is contradictory (assign_accept could
        // name someone other than the invitee, leaving assigned_counterparty
        // as dead, misleading state) — reject rather than pick a winner.
        require!(
            !(self.requires_approval && self.assigned_counterparty.is_some()),
            TendaError::ApprovalModeCannotPreassign
        );
        Ok(())
    }

    /// Populate a freshly-`init`ed escrow account from these args. Shared by
    /// `create_escrow_sol` and `create_escrow_spl` so the field list is
    /// written ONCE — the two paths differ only in `asset` (system program vs.
    /// mint) and which vault bump they carry.
    pub fn init_escrow(
        &self,
        escrow: &mut Escrow,
        asset: Pubkey,
        creator: Pubkey,
        now: i64,
        bump: u8,
        vault_bump: u8,
    ) {
        escrow.escrow_id = self.escrow_id;
        escrow.kind = self.kind;
        escrow.asset = asset;
        escrow.amount = self.amount;
        escrow.creator = creator;
        escrow.counterparty = None;
        escrow.assigned_counterparty = self.assigned_counterparty;
        escrow.status = EscrowStatus::Open;
        escrow.accept_deadline = self.accept_deadline;
        escrow.completion_duration_seconds = self.completion_duration_seconds;
        escrow.completion_deadline = 0;
        escrow.approval_deadline = 0;
        escrow.dispute_bond = self.dispute_bond;
        escrow.is_seeker = self.is_seeker;
        escrow.requires_approval = self.requires_approval;
        escrow.unassign_window_seconds = self.unassign_window_seconds;
        escrow.created_at = now;
        escrow.bump = bump;
        escrow.vault_bump = vault_bump;
    }
}
