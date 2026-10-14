// SPDX-License-Identifier: Apache-2.0
//! Platform-state admin instructions.
//!
//! All mutating instructions (every `set_*` here) are gated on
//! `protocol_admin` — the 3-of-5 Squads multisig. `dispute_admin` only signs
//! `resolve_dispute` and never mutates platform config; its rotation goes
//! through `set_dispute_admin` (protocol_admin-only).
//!
//! `PlatformConfigChanged` events fire on every mutation so the off-chain
//! listener can mirror parameter changes into the `platform_config` table.

pub mod close_legacy_platform;
pub mod initialize_platform;
pub mod set_approval_window;
pub mod set_dispute_admin;
pub mod set_fee_bps;
pub mod set_grace_period;
pub mod set_protocol_admin;
pub mod set_treasury;

// Glob re-exports so Anchor's `#[program]` macro can resolve the
// `__client_accounts_<name>` modules at crate root (via the chain
// `lib.rs::*` → `instructions::*` → `instructions::admin::*` →
// `instructions::admin::<name>::*`). Each submodule's public fn is named
// `<name>_handler` so the globs do not collide.
pub use close_legacy_platform::*;
pub use initialize_platform::*;
pub use set_approval_window::*;
pub use set_dispute_admin::*;
pub use set_fee_bps::*;
pub use set_grace_period::*;
pub use set_protocol_admin::*;
pub use set_treasury::*;

use anchor_lang::prelude::*;

use crate::constants::PLATFORM_SEED;
use crate::errors::TendaError;
use crate::state::PlatformState;

/// Shared accounts struct for every protocol-admin-only `set_*` instruction.
/// The `has_one = protocol_admin` constraint enforces "caller is the current
/// protocol admin"; the signer constraint makes Anchor reject if `protocol_admin`
/// isn't a tx signer.
#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_state.bump,
        has_one = protocol_admin @ TendaError::NotProtocolAdmin,
    )]
    pub platform_state: Account<'info, PlatformState>,

    pub protocol_admin: Signer<'info>,
}

/// An authority may never be the default (all-zero) pubkey — mirror of the
/// EVM contract's `ZeroAddress` guard on the constructor and every rotation.
/// A zero `protocol_admin` bricks every admin instruction, a zero
/// `dispute_admin` leaves every dispute unresolvable, a zero `treasury`
/// burns every fee; none of the three is recoverable on-chain.
pub(crate) fn require_authority(key: &Pubkey) -> Result<()> {
    require_keys_neq!(*key, Pubkey::default(), TendaError::ZeroAuthority);
    Ok(())
}
