// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::initialize_platform::validate_fee_bps;
use super::AdminUpdate;

pub fn set_fee_bps_handler(
    ctx: Context<AdminUpdate>,
    fee_bps: u16,
    seeker_fee_bps: u16,
) -> Result<()> {
    validate_fee_bps(fee_bps, seeker_fee_bps)?;

    let state = &mut ctx.accounts.platform_state;
    let old_fee = state.fee_bps;
    let old_seeker = state.seeker_fee_bps;
    state.fee_bps = fee_bps;
    state.seeker_fee_bps = seeker_fee_bps;

    let now = Clock::get()?.unix_timestamp;
    emit!(PlatformConfigChanged {
        parameter: "fee_bps".to_string(),
        old_value: old_fee.to_string(),
        new_value: fee_bps.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: now,
    });
    emit!(PlatformConfigChanged {
        parameter: "seeker_fee_bps".to_string(),
        old_value: old_seeker.to_string(),
        new_value: seeker_fee_bps.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: now,
    });
    Ok(())
}
