use anchor_lang::prelude::*;

use crate::events::PlatformConfigChanged;

use super::initialize_platform::validate_window;
use super::AdminUpdate;

pub fn set_approval_window_handler(ctx: Context<AdminUpdate>, seconds: i64) -> Result<()> {
    validate_window(seconds)?;

    let state = &mut ctx.accounts.platform_state;
    let old = state.approval_window_seconds;
    state.approval_window_seconds = seconds;

    emit!(PlatformConfigChanged {
        parameter: "approval_window_seconds".to_string(),
        old_value: old.to_string(),
        new_value: seconds.to_string(),
        changed_by: ctx.accounts.protocol_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
