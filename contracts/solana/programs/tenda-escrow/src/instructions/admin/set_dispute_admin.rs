// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::{require_authority, AdminUpdate};

pub fn set_dispute_admin_handler(ctx: Context<AdminUpdate>, new_admin: Pubkey) -> Result<()> {
    require_authority(&new_admin)?;
    let state = &mut ctx.accounts.platform_state;
    let old = state.dispute_admin;
    state.dispute_admin = new_admin;

    emit!(PlatformConfigChanged {
        parameter: "dispute_admin".to_string(),
        old_value: old.to_string(),
        new_value: new_admin.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
