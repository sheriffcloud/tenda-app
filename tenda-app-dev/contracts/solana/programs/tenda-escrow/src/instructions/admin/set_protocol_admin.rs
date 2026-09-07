// SPDX-License-Identifier: Apache-2.0
use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::{require_authority, AdminUpdate};

pub fn set_protocol_admin_handler(ctx: Context<AdminUpdate>, new_admin: Pubkey) -> Result<()> {
    require_authority(&new_admin)?;
    let state = &mut ctx.accounts.platform_state;
    let old = state.protocol_admin;
    state.protocol_admin = new_admin;

    emit!(PlatformConfigChanged {
        parameter: "protocol_admin".to_string(),
        old_value: old.to_string(),
        new_value: new_admin.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
