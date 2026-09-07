//! Instruction handlers. Each submodule owns one on-chain entrypoint plus its
//! `#[derive(Accounts)]` struct. `lib.rs` re-exports the entrypoint fns.

pub mod admin;
pub mod dispute;
pub mod escrow_create;
pub mod escrow_state;
pub mod vault;
