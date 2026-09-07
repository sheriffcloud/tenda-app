use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::AdminUpdate;

pub fn set_treasury_handler(ctx: Context<AdminUpdate>, new_treasury: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.platform_state;
    let old = state.treasury;
    state.treasury = new_treasury;

    emit!(PlatformConfigChanged {
        parameter: "treasury".to_string(),
        old_value: old.to_string(),
        new_value: new_treasury.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
