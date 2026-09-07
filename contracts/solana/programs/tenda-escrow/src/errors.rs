use anchor_lang::prelude::*;

/// Error surface for the rewritten escrow program. Codes are stable — adding
/// new errors at the end of the enum keeps existing on-chain decodings
/// unchanged.
#[error_code]
pub enum TendaError {
    // ---- platform config -------------------------------------------------

    #[msg("platform fee bps exceeds MAX_PLATFORM_FEE_BPS")]
    PlatformFeeTooHigh,

    #[msg("seeker_fee_bps must not exceed fee_bps")]
    SeekerFeeExceedsStandardFee,

    #[msg("approval_window_seconds out of allowed range")]
    ApprovalWindowOutOfRange,

    #[msg("grace_period_seconds out of allowed range")]
    GracePeriodOutOfRange,

    #[msg("caller is not the protocol admin")]
    NotProtocolAdmin,

    #[msg("caller is not the dispute admin")]
    NotDisputeAdmin,

    // ---- escrow validation ----------------------------------------------

    #[msg("amount below MIN_ESCROW_AMOUNT")]
    AmountTooLow,

    #[msg("completion_duration_seconds out of allowed range")]
    CompletionDurationOutOfRange,

    #[msg("accept_deadline must be in the future")]
    AcceptDeadlineInPast,

    #[msg("invalid asset for this instruction (SOL escrow expects system_program; SPL expects mint)")]
    InvalidAssetForInstruction,

    #[msg("supplied mint does not match escrow.asset")]
    MintMismatch,

    #[msg("supplied vault PDA does not match escrow")]
    VaultMismatch,

    #[msg("supplied token account does not match escrow")]
    TokenAccountMismatch,

    #[msg("supplied treasury account does not match platform state")]
    TreasuryMismatch,

    // ---- state machine --------------------------------------------------

    #[msg("escrow status disallows this operation")]
    InvalidEscrowStatus,

    #[msg("caller is not the escrow creator")]
    NotCreator,

    #[msg("caller is not the escrow counterparty")]
    NotCounterparty,

    #[msg("creator cannot accept their own escrow")]
    CreatorCannotAccept,

    #[msg("escrow has an assigned counterparty; only that wallet may accept")]
    NotAssignedCounterparty,

    #[msg("declineAssignedEscrow requires assigned_counterparty != null")]
    NoAssignedCounterparty,

    #[msg("accept_deadline has passed")]
    AcceptDeadlinePassed,

    #[msg("accept_deadline has not yet passed (refundExpired requires expiry)")]
    AcceptDeadlineNotPassed,

    #[msg("submission window has closed (completion_deadline + grace_period_seconds elapsed)")]
    SubmissionWindowClosed,

    #[msg("approval_deadline has not yet passed; counterparty cannot claim stalled")]
    ApprovalDeadlineNotPassed,

    #[msg("reclaim requires completion_deadline + grace_period_seconds to have elapsed")]
    ReclaimWindowNotOpen,

    // ---- dispute --------------------------------------------------------

    #[msg("caller is not creator or counterparty (dispute only by parties)")]
    NotDisputeParty,

    #[msg("escrow has no counterparty yet (cannot dispute Open status)")]
    NoCounterpartyForDispute,

    #[msg("supplied dispute bond does not match escrow.dispute_bond")]
    DisputeBondMismatch,

    // ---- arithmetic -----------------------------------------------------

    #[msg("arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("arithmetic underflow")]
    ArithmeticUnderflow,

    // ---- vault accounting ----------------------------------------------

    #[msg("escrow vault balance is below the amount being settled")]
    VaultUnderfunded,

    #[msg("SOL escrow amount below the vault rent-exempt minimum")]
    AmountBelowVaultRentMinimum,

    #[msg("platform account already uses the current layout — nothing legacy to close")]
    PlatformLayoutCurrent,

    // ---- acceptance modes -----------------------------------------------

    #[msg("escrow requires creator approval; the worker cannot accept directly")]
    ApprovalRequired,

    #[msg("escrow is not in approval mode; assignAccept/unassign do not apply")]
    NotApprovalMode,

    #[msg("creator cannot assign the escrow to themselves")]
    CannotAssignCreator,

    #[msg("assigned counterparty must not be the default (all-zero) pubkey")]
    ZeroCounterparty,

    #[msg("unassign window has closed (accepted_at + unassign_window_seconds elapsed)")]
    UnassignWindowClosed,

    #[msg("unassign_window_seconds out of allowed range")]
    UnassignWindowOutOfRange,

    #[msg("approval mode cannot also pre-assign a counterparty; the modes are exclusive")]
    ApprovalModeCannotPreassign,
}
