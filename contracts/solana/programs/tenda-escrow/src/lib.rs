//! Tenda single-escrow primitive — Solana program.
//!
//! Rewritten in Stage 0 (foundation.md § Solana contract rewrite) to mirror
//! the future Solidity surface 1:1. No UserAccount, no airdrop, no
//! withdraw_earnings — every legacy concept that did not survive the
//! schema-v2 collapse is gone.
//!
//! Event emission uses `emit!` (program-log encoding) for Stage 0. The
//! foundation spec calls for `emit_cpi!`; switching is a focused single-PR
//! change deferred until log-truncation becomes a real concern.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

// Bring `#[derive(Accounts)]` types + the auto-generated
// `__client_accounts_<name>` macro-helper modules into the crate root.
// Anchor's `#[program]` macro resolves these by crate-root path so the
// glob has to walk all the way to the leaf module where the struct lives.
// `#[allow(ambiguous_glob_reexports)]` is needed because multiple submodules
// expose handlers named `handler` / `handler_sol` / `handler_spl`; the
// program surface never names them via this re-export (it uses fully
// qualified paths), so the ambiguity is benign for our purposes.
#[allow(ambiguous_glob_reexports, unused_imports)]
mod _anchor_reexports {
    pub use crate::instructions::admin::initialize_platform::*;
    pub use crate::instructions::admin::set_approval_window::*;
    pub use crate::instructions::admin::set_dispute_admin::*;
    pub use crate::instructions::admin::set_fee_bps::*;
    pub use crate::instructions::admin::set_grace_period::*;
    pub use crate::instructions::admin::set_protocol_admin::*;
    pub use crate::instructions::admin::set_treasury::*;
    // AdminUpdate lives in instructions::admin::mod.rs alongside its
    // generated `__client_accounts_admin_update` module — pull the parent
    // glob, not the struct alone.
    pub use crate::instructions::admin::*;
    pub use crate::instructions::dispute::raise::*;
    pub use crate::instructions::dispute::resolve::*;
    pub use crate::instructions::escrow_create::cancel::*;
    pub use crate::instructions::escrow_create::create_sol::*;
    pub use crate::instructions::escrow_create::create_spl::*;
    pub use crate::instructions::escrow_create::refund_expired::*;
    pub use crate::instructions::escrow_create::shared::CreateEscrowArgs;
    pub use crate::instructions::escrow_state::accept::*;
    pub use crate::instructions::escrow_state::approve::*;
    pub use crate::instructions::escrow_state::assign_accept::*;
    pub use crate::instructions::escrow_state::claim_stalled::*;
    pub use crate::instructions::escrow_state::decline::*;
    pub use crate::instructions::escrow_state::reclaim::*;
    pub use crate::instructions::escrow_state::settlement_accounts::*;
    pub use crate::instructions::escrow_state::submit::*;
    pub use crate::instructions::escrow_state::unassign::*;
}
pub use _anchor_reexports::*;
use state::DisputeWinner;

declare_id!("cU6Z67oRepxKfiaCUKTqHiXMWVifFdYpVG1QC4SR6Eb");

#[program]
pub mod tenda_escrow {
    use super::*;

    // ---- admin -----------------------------------------------------------

    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        args: InitializePlatformArgs,
    ) -> Result<()> {
        initialize_platform_handler(ctx, args)
    }

    /// Devnet migration: close a stale pre-rewrite platform PDA so
    /// `initialize_platform` can re-create it. Permanent no-op against a
    /// current-layout platform (see instruction docs).
    pub fn close_legacy_platform(ctx: Context<CloseLegacyPlatform>) -> Result<()> {
        close_legacy_platform_handler(ctx)
    }

    pub fn set_protocol_admin(ctx: Context<AdminUpdate>, new_admin: Pubkey) -> Result<()> {
        set_protocol_admin_handler(ctx, new_admin)
    }

    pub fn set_dispute_admin(ctx: Context<AdminUpdate>, new_admin: Pubkey) -> Result<()> {
        set_dispute_admin_handler(ctx, new_admin)
    }

    pub fn set_treasury(ctx: Context<AdminUpdate>, new_treasury: Pubkey) -> Result<()> {
        set_treasury_handler(ctx, new_treasury)
    }

    pub fn set_fee_bps(
        ctx: Context<AdminUpdate>,
        fee_bps: u16,
        seeker_fee_bps: u16,
    ) -> Result<()> {
        set_fee_bps_handler(ctx, fee_bps, seeker_fee_bps)
    }

    pub fn set_approval_window(ctx: Context<AdminUpdate>, seconds: i64) -> Result<()> {
        set_approval_window_handler(ctx, seconds)
    }

    pub fn set_grace_period(ctx: Context<AdminUpdate>, seconds: i64) -> Result<()> {
        set_grace_period_handler(ctx, seconds)
    }

    // ---- escrow_create ---------------------------------------------------

    pub fn create_escrow_sol(
        ctx: Context<CreateEscrowSol>,
        args: CreateEscrowArgs,
    ) -> Result<()> {
        instructions::escrow_create::create_sol::handler(ctx, args)
    }

    pub fn create_escrow_spl(
        ctx: Context<CreateEscrowSpl>,
        args: CreateEscrowArgs,
    ) -> Result<()> {
        instructions::escrow_create::create_spl::handler(ctx, args)
    }

    pub fn cancel_escrow_sol(ctx: Context<CancelSol>) -> Result<()> {
        instructions::escrow_create::cancel::handler_sol(ctx)
    }

    pub fn cancel_escrow_spl(ctx: Context<CancelSpl>) -> Result<()> {
        instructions::escrow_create::cancel::handler_spl(ctx)
    }

    pub fn refund_expired_sol(ctx: Context<CancelSol>) -> Result<()> {
        instructions::escrow_create::refund_expired::handler_sol(ctx)
    }

    pub fn refund_expired_spl(ctx: Context<CancelSpl>) -> Result<()> {
        instructions::escrow_create::refund_expired::handler_spl(ctx)
    }

    // ---- escrow_state ----------------------------------------------------

    pub fn accept_escrow(ctx: Context<EscrowMutation>) -> Result<()> {
        instructions::escrow_state::accept::handler(ctx)
    }

    pub fn decline_assigned_escrow(ctx: Context<EscrowMutation>) -> Result<()> {
        instructions::escrow_state::decline::handler(ctx)
    }

    /// Approval mode: creator assigns a worker AND moves the escrow to
    /// Accepted in one instruction (the worker signs nothing to start).
    pub fn assign_accept(ctx: Context<EscrowMutation>, worker: Pubkey) -> Result<()> {
        instructions::escrow_state::assign_accept::handler(ctx, worker)
    }

    /// Approval mode: creator withdraws an assignment inside the unassign
    /// window, returning the escrow to Open with funds untouched.
    pub fn unassign(ctx: Context<EscrowMutation>) -> Result<()> {
        instructions::escrow_state::unassign::handler(ctx)
    }

    pub fn submit_proof(ctx: Context<EscrowMutation>, proof_hash: [u8; 32]) -> Result<()> {
        instructions::escrow_state::submit::handler(ctx, proof_hash)
    }

    pub fn approve_completion_sol(ctx: Context<SettleSol>) -> Result<()> {
        instructions::escrow_state::approve::handler_sol(ctx)
    }

    pub fn approve_completion_spl(ctx: Context<SettleSpl>) -> Result<()> {
        instructions::escrow_state::approve::handler_spl(ctx)
    }

    pub fn claim_stalled_payment_sol(ctx: Context<SettleSol>) -> Result<()> {
        instructions::escrow_state::claim_stalled::handler_sol(ctx)
    }

    pub fn claim_stalled_payment_spl(ctx: Context<SettleSpl>) -> Result<()> {
        instructions::escrow_state::claim_stalled::handler_spl(ctx)
    }

    pub fn reclaim_abandoned_sol(ctx: Context<SettleSol>) -> Result<()> {
        instructions::escrow_state::reclaim::handler_sol(ctx)
    }

    pub fn reclaim_abandoned_spl(ctx: Context<ReclaimSpl>) -> Result<()> {
        instructions::escrow_state::reclaim::handler_spl(ctx)
    }

    // ---- dispute ---------------------------------------------------------

    pub fn dispute_escrow_sol(ctx: Context<DisputeSol>, bond_amount: u64) -> Result<()> {
        instructions::dispute::raise::handler_sol(ctx, bond_amount)
    }

    pub fn dispute_escrow_spl(ctx: Context<DisputeSpl>, bond_amount: u64) -> Result<()> {
        instructions::dispute::raise::handler_spl(ctx, bond_amount)
    }

    pub fn resolve_dispute_sol(
        ctx: Context<ResolveSol>,
        winner: DisputeWinner,
        raiser: Pubkey,
    ) -> Result<()> {
        instructions::dispute::resolve::handler_sol(ctx, winner, raiser)
    }

    pub fn resolve_dispute_spl(
        ctx: Context<ResolveSpl>,
        winner: DisputeWinner,
        raiser: Pubkey,
    ) -> Result<()> {
        instructions::dispute::resolve::handler_spl(ctx, winner, raiser)
    }
}
