# Tenda - Smart Contract Specification

> ## ⚠️ SUPERSEDED — historical v1 spec, do not implement against this
>
> This describes the ORIGINAL program, which was fully rewritten at Stage 0
> (#29, 2026-06). Nothing here matches the deployed program anymore: the gas-
> subsidy airdrop and `UserAccount` are gone; there are now TWO authorities
> (`protocol_admin` + `dispute_admin`), a seeker fee, SPL-token custody
> (`_sol`/`_spl` instruction pairs), exchange-kind escrows, and dispute bonds.
>
> **Current truth:** the program source (`programs/tenda_escrow/`),
> [`README.md`](README.md) (instruction table), and
> `docs/production_setup_guide.md` § 4. Retained only as design history.

**Version:** 1.0 (historical)  
**Platform:** Solana (Anchor Framework)  
**Language:** Rust

---

## Overview

The Tenda escrow smart contract manages trustless gig payments between posters and workers. It locks SOL when a gig is posted, releases payment upon approval, and handles disputes and timeouts.

---

## Core Features

1. **Escrow Creation** - Poster deposits SOL + platform fee
2. **Gig Acceptance** - Worker accepts, locks in commitment
3. **Proof Submission** - Worker submits completion proof
4. **Payment Release** - Poster approves, SOL released to worker
5. **Dispute Handling** - Either party can dispute, admin resolves
6. **Timeout/Refund** - Auto-refund if worker doesn't submit proof within grace period
7. **Gas Subsidy** - New users receive locked airdrop SOL

---

## Contract Accounts

### 1. PlatformState
```rust
pub struct PlatformState {
    pub admin: Pubkey,              // Platform admin wallet
    pub platform_fee_bps: u16,      // Platform fee in basis points (e.g., 200 = 2%)
    pub treasury: Pubkey,            // Platform treasury for fees
    pub total_gigs: u64,             // Total gigs created
    pub total_volume: u64,           // Total SOL processed
    pub grace_period_seconds: i64,   // Grace period after deadline (default: 86400 = 24h)
}
```

### 2. GigEscrow
```rust
pub struct GigEscrow {
    pub gig_id: String,              // UUID from backend
    pub poster: Pubkey,              // Poster wallet address
    pub worker: Option<Pubkey>,      // Worker wallet (None until accepted)
    
    // Payment details
    pub payment_amount: u64,         // Gig payment in lamports
    pub platform_fee: u64,           // Platform fee in lamports
    pub total_locked: u64,           // payment_amount + platform_fee
    
    // Timestamps
    pub created_at: i64,             // Unix timestamp
    pub deadline: i64,               // Work completion deadline
    pub accepted_at: Option<i64>,    // When worker accepted
    pub submitted_at: Option<i64>,   // When proof submitted
    pub completed_at: Option<i64>,   // When payment released
    
    // Status
    pub status: GigStatus,           // Current state
    pub bump: u8,                    // PDA bump seed
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum GigStatus {
    Open,           // Posted, awaiting worker
    Accepted,       // Worker accepted, in progress
    Submitted,      // Worker submitted proof, awaiting approval
    Completed,      // Poster approved, payment released
    Disputed,       // Either party disputed
    Cancelled,      // Poster cancelled before acceptance
    Expired,        // Timed out, refunded
}
```

### 3. UserAccount
```rust
pub struct UserAccount {
    pub wallet: Pubkey,              // User wallet address
    pub airdrop_sol: u64,            // Locked airdrop SOL (in lamports)
    pub earned_sol: u64,             // Withdrawable earned SOL
    pub completed_gigs: u32,         // Total completed gigs
    pub phone_verified: bool,        // Phone verification status
    pub created_at: i64,             // Account creation timestamp
}
```

---

## Functions

### 1. initialize_platform
**Caller:** Admin  
**Purpose:** Initialize platform state (one-time setup)

```rust
pub fn initialize_platform(
    ctx: Context<InitializePlatform>,
    platform_fee_bps: u16,           // e.g., 200 for 2%
    grace_period_seconds: i64,       // e.g., 86400 for 24h
) -> Result<()>
```

**Logic:**
- Create PlatformState account
- Set admin, fee rate, grace period
- Initialize counters to 0

**Checks:**
- Only callable once
- platform_fee_bps <= 1000 (max 10%)

---

### 2. create_user_account
**Caller:** User  
**Purpose:** Create user account for tracking airdrops and earnings

```rust
pub fn create_user_account(
    ctx: Context<CreateUserAccount>,
) -> Result<()>
```

**Logic:**
- Create UserAccount PDA
- Initialize all values to 0/false
- Set created_at timestamp

**Checks:**
- User doesn't already have account

---

### 3. airdrop_gas_subsidy
**Caller:** Platform (backend relayer)  
**Purpose:** Airdrop locked SOL to new users after phone verification

```rust
pub fn airdrop_gas_subsidy(
    ctx: Context<AirdropGasSubsidy>,
    amount: u64,                     // e.g., 5000000 lamports (0.005 SOL)
) -> Result<()>
```

**Logic:**
- Transfer SOL from platform treasury to user account
- Increment user.airdrop_sol (locked)
- Set user.phone_verified = true

**Checks:**
- User has phone_verified = false (one-time airdrop)
- amount <= MAX_AIRDROP (e.g., 0.01 SOL)
- Platform treasury has sufficient balance

---

### 4. create_gig_escrow
**Caller:** Poster  
**Purpose:** Post a gig and lock payment in escrow

```rust
pub fn create_gig_escrow(
    ctx: Context<CreateGigEscrow>,
    gig_id: String,
    payment_amount: u64,             // In lamports
    deadline: i64,                   // Unix timestamp
) -> Result<()>
```

**Logic:**
- Calculate platform_fee = payment_amount * platform_fee_bps / 10000
- Calculate total_locked = payment_amount + platform_fee
- Transfer total_locked SOL from poster to escrow PDA
- Create GigEscrow account
- Set status = Open

**Checks:**
- gig_id is unique
- payment_amount >= MIN_PAYMENT (e.g., 0.001 SOL)
- deadline > current_time
- Poster has sufficient SOL balance

**Issues Identified:**
- ⚠️ Price is FINAL once posted (cannot edit)
- ⚠️ Poster must have SOL for deposit + gas

---

### 5. cancel_gig
**Caller:** Poster  
**Purpose:** Cancel gig before worker accepts, refund escrow

```rust
pub fn cancel_gig(
    ctx: Context<CancelGig>,
) -> Result<()>
```

**Logic:**
- Refund total_locked SOL to poster
- Update status = Cancelled
- Close escrow account

**Checks:**
- Caller is poster
- status == Open (not yet accepted)

**Issues Identified:**
- ✅ Allows poster to cancel if no worker yet
- ⚠️ Worker could accept right before cancellation (race condition)

---

### 6. accept_gig
**Caller:** Worker  
**Purpose:** Accept a gig, commit to completing it

```rust
pub fn accept_gig(
    ctx: Context<AcceptGig>,
) -> Result<()>
```

**Logic:**
- Set worker = caller.key()
- Set accepted_at = current_time
- Update status = Accepted

**Checks:**
- status == Open
- Caller is not poster (can't accept own gig)
- Worker has user account created

**Issues Identified:**
- ⚠️ Worker can accept then ghost (mitigate with reputation)
- ⚠️ First-come-first-served (no worker selection by poster)
- ⚠️ Worker needs SOL for gas (solved by airdrop)

---

### 7. submit_proof
**Caller:** Worker  
**Purpose:** Submit proof of completion (triggers backend to store proof URLs)

```rust
pub fn submit_proof(
    ctx: Context<SubmitProof>,
) -> Result<()>
```

**Logic:**
- Set submitted_at = current_time
- Update status = Submitted

**Checks:**
- Caller is worker
- status == Accepted
- current_time <= deadline + grace_period (can submit during grace period)

**Issues Identified:**
- ⚠️ Proof URLs stored off-chain (backend DB), not in contract
- ⚠️ Worker can submit late (within grace period)
- ✅ Grace period prevents poster from claiming refund immediately after deadline

---

### 8. approve_completion
**Caller:** Poster  
**Purpose:** Approve work, release payment to worker

```rust
pub fn approve_completion(
    ctx: Context<ApproveCompletion>,
) -> Result<()>
```

**Logic:**
- Transfer payment_amount to worker
- Transfer platform_fee to treasury
- Update worker.earned_sol += payment_amount
- Increment worker.completed_gigs += 1
- Set completed_at = current_time
- Update status = Completed
- Close escrow account

**Checks:**
- Caller is poster
- status == Submitted
- Escrow has sufficient balance

**Issues Identified:**
- ✅ Poster controls final payment release
- ⚠️ Poster could maliciously refuse to approve (mitigate with dispute)

---

### 9. dispute_gig
**Caller:** Poster or Worker  
**Purpose:** Open dispute, freeze escrow

```rust
pub fn dispute_gig(
    ctx: Context<DisputeGig>,
    reason: String,                  // Max 500 chars
) -> Result<()>
```

**Logic:**
- Update status = Disputed
- Emit DisputeEvent with caller, gig_id, reason
- Lock escrow (no further actions until resolved)

**Checks:**
- Caller is poster OR worker
- status == Submitted OR Accepted
- reason.len() <= 500

**Issues Identified:**
- ⚠️ Requires manual admin resolution (not automated)
- ⚠️ Funds locked until admin acts
- ⚠️ No deadline for dispute resolution

---

### 10. resolve_dispute
**Caller:** Admin  
**Purpose:** Resolve dispute, release payment to winner

```rust
pub fn resolve_dispute(
    ctx: Context<ResolveDispute>,
    winner: DisputeWinner,
) -> Result<()>

pub enum DisputeWinner {
    Poster,    // Refund poster
    Worker,    // Pay worker
    Split,     // 50/50 split
}
```

**Logic:**
- If winner == Worker:
  - Transfer payment_amount to worker
  - Transfer platform_fee to treasury (still charged)
  - Increment worker.earned_sol
  - Increment worker.completed_gigs
- If winner == Poster:
  - Refund total_locked to poster
- If winner == Split:
  - Transfer 50% payment to worker, 50% to poster
  - Transfer platform_fee to treasury
- Update status = Completed
- Close escrow account

**Checks:**
- Caller is admin
- status == Disputed

**Issues Identified:**
- ⚠️ Centralized admin power (trust required)
- ⚠️ Platform still collects fee even if poster wins dispute
- ⚠️ No appeals process

---

### 11. refund_expired
**Caller:** Poster (or anyone after expiry)  
**Purpose:** Refund poster if worker doesn't submit proof within grace period

```rust
pub fn refund_expired(
    ctx: Context<RefundExpired>,
) -> Result<()>
```

**Logic:**
- Refund total_locked to poster
- Update status = Expired
- Close escrow account

**Checks:**
- current_time > deadline + grace_period
- status == Accepted OR Open (not Submitted)

**Issues Identified:**
- ⚠️ Poster must manually claim refund (costs gas)
- ⚠️ If worker submits 1 second before poster claims, poster's tx fails
- ✅ Grace period prevents unfair refunds while worker uploads proof

**Alternative:** Allow anyone to call (platform backend monitors and auto-refunds)

---

### 12. withdraw_earnings
**Caller:** User  
**Purpose:** Withdraw earned SOL (including unlocked airdrop)

```rust
pub fn withdraw_earnings(
    ctx: Context<WithdrawEarnings>,
    amount: u64,
) -> Result<()>
```

**Logic:**
- If user.completed_gigs >= 1:
  - withdrawable = user.earned_sol + user.airdrop_sol
- Else:
  - withdrawable = user.earned_sol (airdrop still locked)
- Transfer amount to user wallet
- Deduct from user.earned_sol first, then user.airdrop_sol

**Checks:**
- amount <= withdrawable balance
- User has user account

**Issues Identified:**
- ✅ Prevents airdrop abuse (must complete 1 gig)
- ⚠️ User must manually withdraw (not auto-sent)

---

## Security Considerations

### 1. Reentrancy Protection
- ✅ Anchor framework prevents reentrancy by default
- ✅ Close accounts after transfers to prevent double-spend

### 2. Integer Overflow
- ✅ Use checked arithmetic for all math operations
- ✅ Validate payment_amount + platform_fee doesn't overflow u64

### 3. Authorization Checks
- ✅ All functions verify caller identity (poster, worker, admin)
- ✅ Use #[account(signer)] constraints

### 4. PDA Security
- ✅ Use canonical bumps for escrow PDAs
- ✅ Verify PDA seeds match expected values

### 5. Timestamp Manipulation
- ⚠️ Solana clock can be off by ~400ms (acceptable for our use case)
- ✅ Don't rely on exact second precision

---

## Edge Cases & Issues

### Issue 1: Race Conditions

**Problem:** Worker accepts while poster is cancelling  
**Solution:** 
- Backend checks status before allowing cancel
- UI disables cancel button if workers are viewing
- Accept worst case: Worker accepts, poster cancels tx fails

---

### Issue 2: Poster Refuses to Approve

**Problem:** Worker completes task, poster ignores/refuses approval  
**Solution:**
- Worker can dispute after 24h of no response
- Admin reviews evidence, forces approval if valid
- Poster's reputation decreases

**Better Solution (Future):**
- DAO/community voting on disputes
- Stake-based challenge system

---

### Issue 3: Gas Fee Exhaustion

**Problem:** New worker runs out of gas after 1-2 gigs  
**Solution:**
- Show "Low SOL" warning in app
- Suggest converting ₦500 earnings to SOL
- Platform could auto-convert small amount

---

### Issue 4: Flash Loan Attacks

**Problem:** Attacker borrows SOL, creates fake gigs, returns SOL  
**Mitigation:**
- ✅ Not vulnerable (escrow requires actual SOL deposit)
- ✅ No complex DeFi interactions

---

### Issue 5: Sybil Attacks on Airdrop

**Problem:** User creates 100 wallets, claims 100 airdrops  
**Solution:**
- ✅ Require phone verification (1 airdrop per phone)
- ✅ Lock airdrop until 1 gig completed (filters bots)
- Backend tracks IP/device fingerprint

---

### Issue 6: Deadline Timezone Issues

**Problem:** Poster in Lagos (GMT+1), worker in New York (GMT-5)  
**Solution:**
- ✅ Use Unix timestamps (UTC) everywhere
- Frontend converts to user's local timezone
- Clearly show timezone in deadline display

---

### Issue 7: Poster Deletes Gig on Backend

**Problem:** Poster deletes gig from DB while escrow still exists  
**Solution:**
- Backend never hard-deletes, only soft-deletes
- Smart contract is source of truth
- Sync backend state from blockchain events

---

### Issue 8: Platform Fee Changes

**Problem:** Platform increases fee from 2% → 5% mid-gig  
**Solution:**
- ✅ Fee locked at gig creation time (stored in GigEscrow)
- New fee only applies to new gigs
- Clear communication before fee changes

---

### Issue 9: Lost Private Keys

**Problem:** Poster loses wallet, cannot approve/dispute  
**Solution:**
- ⚠️ Funds locked forever (blockchain limitation)
- Recommendation: Social recovery wallets (Squads multisig)
- Auto-approve after 7 days of inactivity (risky, not recommended)

---

### Issue 10: Network Congestion

**Problem:** High Solana network fees during congestion  
**Solution:**
- Dynamic gas budget based on current network conditions
- Queue low-priority txs for off-peak hours
- Users can pay priority fees for urgent approvals

---

### Issue 11: SOL Price Volatility

**Problem:** Gig posted at ₦5000 ($10), SOL crashes 50%, worker receives ₦2500  
**Solution:**
- ⚠️ Workers bear SOL price risk
- Display "Estimated ₦ value may vary"
- Future: Stablecoin option (USDC)

**Reverse Problem:** SOL moons, poster overpays  
**Solution:**
- ⚠️ Poster bears upside risk
- Lock in SOL amount at posting time

---

### Issue 12: Dust Accounts

**Problem:** 1000s of closed escrow accounts create blockchain bloat  
**Solution:**
- ✅ Close accounts after completion/refund (rent refunded)
- Reclaim SOL rent to poster/worker

---

### Issue 13: Spam Gigs

**Problem:** Bots create fake gigs to spam platform  
**Solution:**
- Minimum deposit (e.g., $5)
- Captcha on frontend
- Rate limit gig creation per wallet
- Backend filters obvious spam

---

### Issue 14: Worker Submits Wrong Proof

**Problem:** Worker uploads random photos, not actual completion  
**Solution:**
- Poster reviews proof before approving
- Poster disputes → Admin reviews
- Worker's reputation tanks

---

### Issue 15: Partial Completion

**Problem:** Worker delivers 3/5 packages, claims partial payment  
**Solution:**
- ⚠️ Contract doesn't support partial payments
- Poster must approve full amount or dispute
- Future: Milestone-based escrow

---

## Gas Optimization

1. **Close accounts** after completion to reclaim rent
2. **Batch operations** where possible (future: batch approvals)
3. **Minimize account size** - use Option<T> for optional fields
4. **Use u64 for timestamps** instead of i64 (saves 8 bytes per account)
5. **Compress status enum** to u8

---

## Testing Requirements

### Unit Tests
- ✅ Create gig → Accept → Submit → Approve (happy path)
- ✅ Create gig → Cancel before acceptance
- ✅ Accept gig → Submit late (within grace) → Approve
- ✅ Accept gig → No submission → Refund after grace
- ✅ Submit proof → Dispute → Admin resolves
- ✅ Airdrop → Complete 1 gig → Withdraw (unlocked)
- ✅ Airdrop → 0 gigs → Withdraw fails (locked)

### Integration Tests
- ✅ Multiple gigs by same poster
- ✅ Worker completes multiple gigs, earnings accumulate
- ✅ Concurrent accepts (race condition)
- ✅ Platform fee calculation accuracy

### Security Tests
- ✅ Unauthorized approve (non-poster)
- ✅ Double-spend attempts
- ✅ Overflow attacks on payment amounts
- ✅ Invalid deadline (past timestamp)

---

## Deployment Plan

**Devnet:**
1. Deploy contract
2. Initialize platform state
3. Airdrop test SOL to test wallets
4. Run full test suite
5. Frontend integration testing

**Mainnet:**
1. Audit smart contract (optional but recommended)
2. Deploy to mainnet
3. Initialize with production values
4. Monitor for 24h with small transactions
5. Gradual rollout

---

## Future Improvements

1. **Milestone-based escrow** - Split payment for multi-stage gigs
2. **Stablecoin support** - USDC/USDT to avoid volatility
3. **DAO governance** - Community dispute resolution
4. **Reputation NFTs** - On-chain verifiable credentials
5. **Insurance pool** - Cover disputed gigs
6. **Automated approvals** - AI reviews proof for simple tasks
7. **Multi-sig support** - For business accounts
8. **Recurring gigs** - Auto-create escrow for repeat workers

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Status:** Draft - Ready for Review
