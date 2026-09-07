//! State-transition instructions that move escrow.status forward.
//!
//! - `accept` / `decline` / `submit` move state only (no funds).
//! - `assign_accept` / `unassign` are the approval-mode counterparts of
//!   `accept` / `decline`: the CREATOR moves the escrow, not the worker.
//! - `approve` / `claim_stalled` settle to counterparty with platform fee.
//! - `reclaim` refunds creator (counterparty ghosted past grace).
//!
//! Settlement instructions split SOL vs. SPL into separate handlers so each
//! can use a tight `#[derive(Accounts)]` matching the asset class.

pub mod accept;
pub mod approve;
pub mod assign_accept;
pub mod claim_stalled;
pub mod decline;
pub mod reclaim;
pub mod settlement_accounts;
pub mod submit;
pub mod unassign;

// Re-export only the public types named by lib.rs. Handlers are reached via
// their module path; the `handler*` collisions otherwise cause
// ambiguous-glob warnings.
pub use settlement_accounts::{compute_fee, EscrowMutation, ReclaimSpl, SettleSol, SettleSpl};
