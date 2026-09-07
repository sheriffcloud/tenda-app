use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::AdminUpdate;

pub fn set_dispute_admin_handler(ctx: Context<AdminUpdate>, new_admin: Pubkey) -> Result<()> {
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
