// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

/// Singleton platform-config PDA. Seeds = [PLATFORM_SEED].
///
/// `protocol_admin` and `dispute_admin` are deliberately separate (foundation
/// L522, L587): routine dispute resolution runs through a single ops-held key
/// (rotatable to 2-of-3 in Stage 5) while parameter changes require the
/// 3-of-5 Squads multisig.
///
/// `grace_period_seconds` and `approval_window_seconds` are mutable via
/// admin-only instructions so we can tune without a contract redeploy.
#[account]
pub struct PlatformState {
    pub protocol_admin: Pubkey,
    pub dispute_admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub seeker_fee_bps: u16,
    pub approval_window_seconds: i64,
    pub grace_period_seconds: i64,
    pub bump: u8,
}

impl PlatformState {
    /// `8` discriminator
    /// `+ 32 * 3` protocol_admin / dispute_admin / treasury
    /// `+ 2 * 2`  fee_bps / seeker_fee_bps
    /// `+ 8 * 2`  approval_window / grace_period
    /// `+ 1`      bump
    ///
    /// A reserved `total_volume: u64` sat between `grace_period_seconds` and
    /// `bump` until #27 and was never written by any instruction. Removing it
    /// SHRANK this by 8, which is what makes an older account migratable:
    /// `close_legacy_platform` closes any platform PDA whose length is not
    /// exactly `LEN`, so a pre-#27 account (133 bytes) becomes closeable and
    /// `initialize_platform` can re-create it at the current size.
    pub const LEN: usize = 8 + 32 * 3 + 2 * 2 + 8 * 2 + 1;

    pub fn effective_fee_bps(&self, is_seeker: bool) -> u16 {
        if is_seeker {
            self.seeker_fee_bps
        } else {
            self.fee_bps
        }
    }
}
