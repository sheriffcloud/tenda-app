use anchor_lang::prelude::*;

/// Single chain-agnostic escrow primitive. Mirrors the future Solidity surface
/// 1:1 (see `stage-0-foundation.md` § Solana contract rewrite).
///
/// `escrow_id` is a 16-byte UUID supplied by the server. It is the second seed
/// of the data PDA, the SOL vault PDA, and the SPL vault PDA — so an
/// `escrow_id` collision is detected at account creation (the PDA already
/// exists; the `init` constraint fails).
///
/// `counterparty` is `None` at creation, set by `accept_escrow`.
/// `assigned_counterparty`:
///   - `None` ⇒ public escrow, anyone (except creator) may accept.
///   - `Some(pk)` ⇒ direct-assigned; only `pk` may accept.
/// The assigned worker may release the assignment via
/// `decline_assigned_escrow`, which clears `assigned_counterparty` to `None`
/// and leaves status = Open.
#[account]
pub struct Escrow {
    pub escrow_id: [u8; 16],
    pub kind: EscrowKind,
    /// SPL mint pubkey for token escrows; `system_program::ID` for native SOL.
    pub asset: Pubkey,
    pub amount: u64,
    pub creator: Pubkey,
    pub counterparty: Option<Pubkey>,
    pub assigned_counterparty: Option<Pubkey>,
    pub status: EscrowStatus,
    pub accept_deadline: i64,
    /// Stored at create-time so `accept_escrow` can compute
    /// `completion_deadline = now + completion_duration_seconds` without
    /// requiring the caller to supply it again.
    pub completion_duration_seconds: i64,
    /// 0 at create; set by `accept_escrow` to `now + completion_duration_seconds`.
    pub completion_deadline: i64,
    /// 0 at create; set by `submit_proof` to
    /// `now + platform_state.approval_window_seconds`.
    pub approval_deadline: i64,
    pub dispute_bond: u64,
    pub is_seeker: bool,
    /// Acceptance mode, fixed at create.
    ///   `false` ⇒ the worker moves the escrow to Accepted themselves via
    ///     `accept_escrow` (open first-come, or restricted to
    ///     `assigned_counterparty` when that is set).
    ///   `true`  ⇒ `accept_escrow` is closed; only the creator can move it,
    ///     via `assign_accept`.
    ///
    /// The two guards make the mode an EXACT witness of provenance:
    /// `status == Accepted && requires_approval` holds if and only if the
    /// creator assigned the worker, i.e. the worker never signed. `unassign`
    /// relies on that equivalence, so a worker who accepted of their own
    /// accord can never be unassigned.
    pub requires_approval: bool,
    /// How long after `assign_accept` the creator may still `unassign`.
    /// Per-escrow (a term of THIS deal, fixed when it is posted) rather than
    /// a mutable platform-wide value, so changing the default never
    /// retroactively re-opens a settled assignment — and, unlike a
    /// `PlatformState` field, it does not resize the singleton platform PDA.
    /// Server-supplied from `platform_config`, bounded on-chain by
    /// `MIN`/`MAX_UNASSIGN_WINDOW_SECONDS` exactly like
    /// `completion_duration_seconds`. Only meaningful when
    /// `requires_approval` is true.
    pub unassign_window_seconds: i64,
    pub created_at: i64,
    /// Bump for the Escrow data PDA. Stored so settlement instructions can
    /// `signer = [ESCROW_SEED, escrow_id.as_ref(), &[bump]]` without re-deriving.
    pub bump: u8,
    /// Bump for the per-escrow SOL vault PDA. 0 if `kind != Sol`.
    pub vault_bump: u8,
}

impl Escrow {
    /// `8` discriminator
    /// `+ 16` escrow_id
    /// `+ 1`  kind (repr(u8))
    /// `+ 32` asset
    /// `+ 8`  amount
    /// `+ 32` creator
    /// `+ 33` counterparty (Option<Pubkey>: 1 tag + 32 pk)
    /// `+ 33` assigned_counterparty
    /// `+ 1`  status (repr(u8))
    /// `+ 8`  accept_deadline
    /// `+ 8`  completion_duration_seconds
    /// `+ 8`  completion_deadline
    /// `+ 8`  approval_deadline
    /// `+ 8`  dispute_bond
    /// `+ 1`  is_seeker
    /// `+ 1`  requires_approval
    /// `+ 8`  unassign_window_seconds
    /// `+ 8`  created_at
    /// `+ 1`  bump
    /// `+ 1`  vault_bump
    pub const LEN: usize =
        8 + 16 + 1 + 32 + 8 + 32 + 33 + 33 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 8 + 1 + 1;

    /// When this escrow was accepted. Not stored: both accept paths set
    /// `completion_deadline = accepted_at + completion_duration_seconds`, so
    /// the timestamp is recoverable exactly, in either mode. Only meaningful
    /// while the escrow is `Accepted` — before that `completion_deadline` is
    /// 0 and this returns a negative value, which every caller excludes by
    /// checking status first.
    pub fn accepted_at(&self) -> i64 {
        self.completion_deadline - self.completion_duration_seconds
    }
}

/// Escrow asset class. Wider type than a bool because Stage 3+ will add EVM
/// variants and a discriminant gives the IDL a stable shape across chains.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EscrowKind {
    /// Gig: creator pays counterparty for work delivered.
    Gig = 0,
    /// Exchange: two-sided peer-to-peer (e.g. cash-for-crypto).
    Exchange = 1,
}

/// On-chain status. Discriminants are explicit so server-side decoders are
/// not broken by reordering. The DB-only `Draft` status (foundation.md L548)
/// never appears here.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EscrowStatus {
    Open = 0,
    Accepted = 1,
    Submitted = 2,
    Completed = 3,
    Cancelled = 4,
    Refunded = 5,
    Disputed = 6,
    Resolved = 7,
}

/// Winner selection for `resolve_dispute`. Wire encoding `u8` so the on-chain
/// payload survives IDL rebuilds without reordering surprises.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum DisputeWinner {
    Creator = 0,
    Counterparty = 1,
    Split = 2,
}
