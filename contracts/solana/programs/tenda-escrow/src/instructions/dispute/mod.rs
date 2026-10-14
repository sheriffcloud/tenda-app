// SPDX-License-Identifier: Apache-2.0
//! Dispute lifecycle.
//!
//! Bond economics (decision recorded in `open_issues.md` — confirmation gate
//! before mainnet):
//!   * Raiser-wins  → bond refunded to raiser, escrow distributed per winner.
//!   * Raiser-loses → bond forfeited to the other party (NOT treasury).
//!   * Split        → bond refunded to raiser, escrow split 50/50.

pub mod raise;
pub mod resolve;

pub use raise::{DisputeSol, DisputeSpl};
pub use resolve::{ResolveSol, ResolveSpl};
