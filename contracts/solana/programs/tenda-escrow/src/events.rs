use anchor_lang::prelude::*;

use crate::state::{DisputeWinner, EscrowKind, EscrowStatus};

// ============================================================================
// All events use `emit_cpi!` from instruction handlers (foundation.md L589).
// Inner-instruction encoding lets the off-chain listener decode the full
// payload from `meta.innerInstructions` without parsing Anchor program logs
// (`Program data:` lines are truncated when the log buffer fills).
//
// Field naming mirrors the future Solidity event surface — server's
// `verifyTx` decoder accepts both Solana and EVM via the same field names.
// ============================================================================

#[event]
pub struct PlatformInitialized {
    pub protocol_admin: Pubkey,
    pub dispute_admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub seeker_fee_bps: u16,
    pub approval_window_seconds: i64,
    pub grace_period_seconds: i64,
    pub timestamp: i64,
}

#[event]
pub struct PlatformConfigChanged {
    /// Identifier of the parameter that changed:
    /// `"fee_bps"`, `"seeker_fee_bps"`, `"approval_window_seconds"`,
    /// `"grace_period_seconds"`, `"dispute_admin"`, `"protocol_admin"`,
    /// `"treasury"`. Listener routes on this value.
    pub parameter: String,
    /// Old value rendered as base-10 (numbers) or base-58 (pubkeys) so a
    /// single `String` works across heterogeneous parameter types.
    pub old_value: String,
    pub new_value: String,
    pub changed_by: Pubkey,
    pub timestamp: i64,
}

// ---- escrow lifecycle ------------------------------------------------------

#[event]
pub struct EscrowCreated {
    pub escrow_id: [u8; 16],
    pub kind: EscrowKind,
    pub asset: Pubkey,
    pub amount: u64,
    pub creator: Pubkey,
    pub assigned_counterparty: Option<Pubkey>,
    pub accept_deadline: i64,
    pub completion_duration_seconds: i64,
    pub dispute_bond: u64,
    pub is_seeker: bool,
    pub timestamp: i64,
}

#[event]
pub struct EscrowAccepted {
    pub escrow_id: [u8; 16],
    pub counterparty: Pubkey,
    pub completion_deadline: i64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowDeclined {
    pub escrow_id: [u8; 16],
    pub declined_by: Pubkey,
    pub timestamp: i64,
}

/// Approval-mode counterpart of `EscrowAccepted`: the creator, not the worker,
/// moved the escrow to Accepted. Kept a DISTINCT event (rather than reusing
/// `EscrowAccepted`) because the actor differs — a wallet history must not
/// label the poster's transaction "Gig accepted".
#[event]
pub struct CounterpartyAssigned {
    pub escrow_id: [u8; 16],
    pub counterparty: Pubkey,
    pub assigned_by: Pubkey,
    pub completion_deadline: i64,
    pub timestamp: i64,
}

/// The creator withdrew an assignment inside the unassign window; the escrow
/// returns to Open with its funds untouched.
#[event]
pub struct AssignmentReleased {
    pub escrow_id: [u8; 16],
    pub counterparty: Pubkey,
    pub released_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProofSubmitted {
    pub escrow_id: [u8; 16],
    pub counterparty: Pubkey,
    pub approval_deadline: i64,
    /// 32-byte hash of the proof bundle (URI + metadata). Server stores the
    /// pre-image in `gig_proofs`; on-chain only carries the commitment.
    pub proof_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct EscrowApproved {
    pub escrow_id: [u8; 16],
    pub creator: Pubkey,
    pub counterparty: Pubkey,
    pub amount: u64,
    pub platform_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct PaymentClaimed {
    pub escrow_id: [u8; 16],
    pub counterparty: Pubkey,
    pub amount: u64,
    pub platform_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow_id: [u8; 16],
    pub creator: Pubkey,
    pub refund_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowExpired {
    pub escrow_id: [u8; 16],
    pub creator: Pubkey,
    pub refund_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowAbandoned {
    pub escrow_id: [u8; 16],
    pub creator: Pubkey,
    pub counterparty: Pubkey,
    pub refund_amount: u64,
    pub timestamp: i64,
}

// ---- dispute ---------------------------------------------------------------

#[event]
pub struct DisputeRaised {
    pub escrow_id: [u8; 16],
    pub raised_by: Pubkey,
    pub from_status: EscrowStatus,
    pub bond_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct DisputeResolved {
    pub escrow_id: [u8; 16],
    pub winner: DisputeWinner,
    pub creator_payout: u64,
    pub counterparty_payout: u64,
    pub platform_fee: u64,
    /// `bond_refund_to` is `Some(creator)` or `Some(counterparty)` when the
    /// bond is returned to its raiser, `None` when forfeited to the other
    /// party (see dispute economics note in `dispute/resolve.rs`).
    pub bond_refund_to: Option<Pubkey>,
    pub bond_amount: u64,
    pub timestamp: i64,
}
