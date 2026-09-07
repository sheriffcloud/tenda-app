//! Escrow creation + creator-initiated unwinds (cancel, refund_expired).
//!
//! SOL and SPL paths split into separate instructions so each can declare a
//! tight `#[derive(Accounts)]` (lamport vault vs. SPL token account).

pub mod cancel;
pub mod create_sol;
pub mod create_spl;
pub mod refund_expired;
pub mod shared;

// Re-export only the public types the program surface (lib.rs) names directly.
// Handler fns are referenced through their module path
// (`escrow_create::create_sol::handler(...)`), so re-exporting them here
// would cause ambiguous-glob warnings.
pub use cancel::{CancelSol, CancelSpl};
pub use create_sol::CreateEscrowSol;
pub use create_spl::CreateEscrowSpl;
pub use shared::CreateEscrowArgs;
