use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::initialize_platform::validate_grace;
use super::AdminUpdate;

pub fn set_grace_period_handler(ctx: Context<AdminUpdate>, seconds: i64) -> Result<()> {
    validate_grace(seconds)?;

    let state = &mut ctx.accounts.platform_state;
    let old = state.grace_period_seconds;
    state.grace_period_seconds = seconds;

    emit!(PlatformConfigChanged {
        parameter: "grace_period_seconds".to_string(),
        old_value: old.to_string(),
        new_value: seconds.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
