// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

// ============================================================================
// PDA seeds
// ============================================================================

/// PlatformState PDA: seeds = [PLATFORM_SEED].
#[constant]
pub const PLATFORM_SEED: &[u8] = b"platform";

/// Escrow data PDA: seeds = [ESCROW_SEED, escrow_id].
#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";

/// Per-escrow SOL vault PDA (system-owned): seeds = [ESCROW_VAULT_SEED, escrow_id].
/// Holds lamports for native-SOL escrows. Separate from the data PDA so
/// rent-exempt lamports never mingle with the escrowed amount + bond — a
/// standard footgun the two-vault layout eliminates.
#[constant]
pub const ESCROW_VAULT_SEED: &[u8] = b"escrow_vault";

/// Per-escrow SPL token ATA-equivalent PDA: seeds = [ESCROW_TOKEN_SEED, escrow_id].
/// Holds SPL token balance for token escrows. Owned by Token Program; the
/// authority is the Escrow data PDA so settlement instructions sign as that PDA.
#[constant]
pub const ESCROW_TOKEN_SEED: &[u8] = b"escrow_token";

// ============================================================================
// Limits (validated on-chain; server enforces tighter bounds where appropriate)
// ============================================================================

/// Hard ceiling on platform fee. 1000 bps = 10%. Anything beyond is presumed
/// configuration error and rejected at `initializePlatform` / `setFeeBps`.
pub const MAX_PLATFORM_FEE_BPS: u16 = 1_000;

/// Minimum `approval_window_seconds` accepted by `setApprovalWindow`.
/// 1 hour — keeps creators from accidentally setting a zero-window that makes
/// every submission instantly claimable by counterparty.
pub const MIN_APPROVAL_WINDOW_SECONDS: i64 = 3_600;

/// Maximum `approval_window_seconds`. 30 days — beyond this, counterparty
/// payments stall indefinitely; tune via `setApprovalWindow` if needed.
pub const MAX_APPROVAL_WINDOW_SECONDS: i64 = 30 * 24 * 3_600;

/// Minimum `grace_period_seconds`. 0 means submit cuts off exactly at
/// `completion_deadline`; allowed but discouraged.
pub const MIN_GRACE_PERIOD_SECONDS: i64 = 0;

/// Maximum `grace_period_seconds`. 14 days — wider grace makes `reclaimAbandoned`
/// effectively unreachable; cap to keep the abandonment path operational.
pub const MAX_GRACE_PERIOD_SECONDS: i64 = 14 * 24 * 3_600;

/// Minimum completion duration (1 hour). Sub-hour gigs are a UX smell; reject.
pub const MIN_COMPLETION_DURATION_SECONDS: i64 = 3_600;

/// Maximum completion duration (180 days). Beyond half a year, escrow is a poor
/// fit for the workflow — use staged sub-escrows.
pub const MAX_COMPLETION_DURATION_SECONDS: i64 = 180 * 24 * 3_600;

/// Minimum `unassign_window_seconds`. A zero window is allowed: it means
/// "assignment is final the moment it is made", a legitimate poster choice.
pub const MIN_UNASSIGN_WINDOW_SECONDS: i64 = 0;

/// Maximum `unassign_window_seconds`. 1 day — capped well below the shortest
/// completion duration so an unassign window can never span a whole gig; past
/// this point the creator must use the normal reclaim path rather than yanking
/// a worker who may already be working.
pub const MAX_UNASSIGN_WINDOW_SECONDS: i64 = 24 * 3_600;

/// Minimum escrow amount (1 lamport / 1 token unit). Zero-amount escrows are
/// always rejected because every settlement path assumes positive transfer.
pub const MIN_ESCROW_AMOUNT: u64 = 1;
