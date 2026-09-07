# Tenda Roadmap

**Where we are:** a multichain gig + P2P exchange marketplace — mobile app,
web app, admin dashboard, and API — built on one on-chain escrow primitive
with contracts on Solana and EVM (Base, Celo). Non-custodial by design,
multi-method auth, disputes with on-chain resolution. Running testnet-first
today; mainnet rollout is in progress. The chain layer is config-driven, so
new EVM chains are configuration, not code.

**Where we're going:** *Tenda is the Human API* — AI agents post tasks, humans
on the ground complete them, smart-contract escrow settles on proof.

Agents are structurally bad at physical presence, local ground truth, human
judgment, and legal/social personhood — and those gaps are exactly what
they'll pay humans for. Tenda's existing rails (gig posting, worker
onboarding, escrow) make the agent gateway a new *client type*, not a new
platform. The design is chain-agnostic: agent-facing settlement, verification
compute, and storage plug in per chain through the same registry the escrow
already uses.

## Phase 1 — Beachhead: agent-ready rails *(now)*

- Extend chain coverage to AI-native EVM chains (config-driven: one manifest
  entry + deployment secrets per chain)
- **Proof-type field** on the gig schema (photo / geotag / audio / text /
  call-log / video / structured) — the load-bearing primitive for everything
  after
- Read-only **Agent API v0**: list gigs, gig detail, proof requirements —
  machine-readable from day one

## Phase 2 — The Human API

- **Agent API v1**: agents POST tasks with proof-type spec, budget, deadline,
  geographic scope
- **HTTP-native agent payments** (x402-style `402 Payment Required`): the
  agent signs a payment authorization and the escrow is funded straight from
  its wallet in one HTTP round-trip — no gas, no broadcasting, no custody
- Agent-posted tasks surface in the worker apps, badged as agent-origin;
  manual verification fallback, escrow release on approval

## Phase 3 — Auto-verification

- Verification pipelines per proof type (geotag radius, image
  classification, audio validation, translation quality), runnable on
  verifiable/decentralized compute
- Machine-checkable proofs auto-release escrow; ambiguous cases fall to a
  human review queue; dispute rate becomes a per-proof-type metric

## Phase 4 — Identity & reputation

- On-chain agent identity for agent accounts (ERC-7857-style): hiring
  history, dispute rate, spend
- Worker reputation on-chain: completion rate, verification pass rate,
  specializations (languages, locations, devices)
- Matching by verified capability

## Phase 5 — The data flywheel

- Proof artifacts and commissioned datasets on decentralized storage with
  licensing terms; dataset marketplace with worker royalties on reuse
- Recurring/streaming tasks (standing orders, SLA-backed)
- Tenda as ground-truth infrastructure, not just a task board
