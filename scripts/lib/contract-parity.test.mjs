import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertLimitsEqual,
  parseTestLimits,
  evalSeconds,
  parseEnumVariants,
  parseSolidity,
  parseSolana,
  parseSharedConstants,
  assertSpecsEqual,
} from './contract-parity.mjs'

// --- fixtures mirroring the three real source shapes (all in agreement) ---

const SOLIDITY = `
  enum Status {
    Open, // 0
    Accepted, Submitted, Completed, Cancelled, Refunded, Disputed, Resolved
  }
  uint8 public constant KIND_GIG = 0;
  uint8 public constant KIND_EXCHANGE = 1;
  uint8 public constant WINNER_CREATOR = 0;
  uint8 public constant WINNER_COUNTERPARTY = 1;
  uint8 public constant WINNER_SPLIT = 2;
  uint16 public constant MAX_PLATFORM_FEE_BPS = 1_000;
  uint64 public constant MIN_APPROVAL_WINDOW_SECONDS = 3_600;
  uint64 public constant MAX_APPROVAL_WINDOW_SECONDS = 30 days;
  uint64 public constant MAX_GRACE_PERIOD_SECONDS = 14 days;
  uint64 public constant MIN_COMPLETION_DURATION_SECONDS = 3_600;
  uint64 public constant MAX_COMPLETION_DURATION_SECONDS = 180 days;
  uint64 public constant MIN_UNASSIGN_WINDOW_SECONDS = 0;
  uint64 public constant MAX_UNASSIGN_WINDOW_SECONDS = 1 days;
`

const SOLANA_ESCROW = `
  pub enum EscrowKind { Gig = 0, Exchange = 1 }
  pub enum EscrowStatus {
    Open = 0, Accepted = 1, Submitted = 2, Completed = 3,
    Cancelled = 4, Refunded = 5, Disputed = 6, Resolved = 7,
  }
  pub enum DisputeWinner { Creator = 0, Counterparty = 1, Split = 2 }
`

const SOLANA_CONSTANTS = `
  pub const PLATFORM_SEED: &[u8] = b"platform";
  pub const MAX_PLATFORM_FEE_BPS: u16 = 1_000;
  pub const MIN_APPROVAL_WINDOW_SECONDS: i64 = 3_600;
  pub const MAX_APPROVAL_WINDOW_SECONDS: i64 = 30 * 24 * 3_600;
  pub const MAX_GRACE_PERIOD_SECONDS: i64 = 14 * 24 * 3_600;
  pub const MIN_COMPLETION_DURATION_SECONDS: i64 = 3_600;
  pub const MAX_COMPLETION_DURATION_SECONDS: i64 = 180 * 24 * 3_600;
  pub const MIN_UNASSIGN_WINDOW_SECONDS: i64 = 0;
  pub const MAX_UNASSIGN_WINDOW_SECONDS: i64 = 24 * 3_600;
`

const SHARED = `
  export const ESCROW_STATUS_ORDER = ['open','accepted','submitted','completed','cancelled','refunded','disputed','resolved'] as const
  export const ESCROW_KIND_CODE = { gig: 0, exchange: 1 } as const
  export const DISPUTE_WINNER_CODE = { creator: 0, counterparty: 1, split: 2 } as const
  export const ESCROW_LIMITS = {
    maxPlatformFeeBps: 1000,
    minApprovalWindowSeconds: 3600,
    maxApprovalWindowSeconds: 30 * 24 * 60 * 60,
    maxGracePeriodSeconds: 14 * 24 * 60 * 60,
    minCompletionDurationSeconds: 3600,
    maxCompletionDurationSeconds: 180 * 24 * 60 * 60,
    minUnassignWindowSeconds: 0,
    maxUnassignWindowSeconds: 24 * 60 * 60,
  } as const
`

const sol = () => parseSolidity(SOLIDITY)
const anc = () => parseSolana(SOLANA_ESCROW, SOLANA_CONSTANTS)
const shr = () => parseSharedConstants(SHARED)

// --- evalSeconds (the cross-syntax normaliser) ---

test('evalSeconds spans Solidity units, Rust/TS products, and underscores', () => {
  assert.equal(evalSeconds('30 days'), 2592000)
  assert.equal(evalSeconds('14 days'), 1209600)
  assert.equal(evalSeconds('180 days'), 15552000)
  assert.equal(evalSeconds('30 * 24 * 3_600'), 2592000)
  assert.equal(evalSeconds('180 * 24 * 60 * 60'), 15552000)
  assert.equal(evalSeconds('3_600'), 3600)
  assert.equal(evalSeconds('1_000'), 1000)
  assert.equal(evalSeconds('0'), 0)
})

test('evalSeconds throws on empty / non-numeric tokens', () => {
  assert.throws(() => evalSeconds('   '), /empty expression/)
  assert.throws(() => evalSeconds('block.timestamp'), /cannot evaluate/)
})

test('parseEnumVariants strips comments, doc-comments and discriminants', () => {
  assert.deepEqual(parseEnumVariants('Open, // 0\n Accepted // 1'), ['open', 'accepted'])
  assert.deepEqual(parseEnumVariants('Gig = 0, Exchange = 1'), ['gig', 'exchange'])
})

// --- parsers produce a consistent spec, and the three agree (positive) ---

test('all three sources parse to identical specs', () => {
  const spec = assertSpecsEqual([
    { label: 'solidity', spec: sol() },
    { label: 'solana', spec: anc() },
    { label: 'shared', spec: shr() },
  ])
  assert.equal(spec.status.length, 8)
  assert.equal(spec.status[0], 'open')
  assert.equal(spec.status[7], 'resolved')
  assert.deepEqual(spec.kind, { gig: 0, exchange: 1 })
  assert.deepEqual(spec.winner, { creator: 0, counterparty: 1, split: 2 })
  assert.equal(spec.limits.maxPlatformFeeBps, 1000)
  assert.equal(spec.limits.maxGracePeriodSeconds, 1209600)
  assert.equal(spec.limits.maxCompletionDurationSeconds, 15552000)
})

// --- assertSpecsEqual negatives: each field diverging ---

test('throws when status order diverges (the ABI-invisible reorder)', () => {
  const reordered = parseSharedConstants(
    SHARED.replace("'accepted','submitted'", "'submitted','accepted'"),
  )
  assert.throws(
    () => assertSpecsEqual([{ label: 'solidity', spec: sol() }, { label: 'shared', spec: reordered }]),
    /parity mismatch in "status"/,
  )
})

test('throws when a kind code diverges', () => {
  const badKind = parseSharedConstants(SHARED.replace('gig: 0, exchange: 1', 'gig: 1, exchange: 0'))
  assert.throws(
    () => assertSpecsEqual([{ label: 'solidity', spec: sol() }, { label: 'shared', spec: badKind }]),
    /parity mismatch in "kind"/,
  )
})

test('throws when a winner code diverges', () => {
  const badWinner = parseSolidity(SOLIDITY.replace('WINNER_SPLIT = 2', 'WINNER_SPLIT = 3'))
  assert.throws(
    () => assertSpecsEqual([{ label: 'shared', spec: shr() }, { label: 'solidity', spec: badWinner }]),
    /parity mismatch in "winner"/,
  )
})

test('throws when a limit constant diverges (fee cap loosened)', () => {
  const badLimit = parseSharedConstants(SHARED.replace('maxPlatformFeeBps: 1000', 'maxPlatformFeeBps: 10000'))
  assert.throws(
    () => assertSpecsEqual([{ label: 'solidity', spec: sol() }, { label: 'shared', spec: badLimit }]),
    /parity mismatch in "limits"/,
  )
})

test('throws when the grace limit diverges (30d vs the contract 14d)', () => {
  const badGrace = parseSharedConstants(
    SHARED.replace('maxGracePeriodSeconds: 14 * 24 * 60 * 60', 'maxGracePeriodSeconds: 30 * 24 * 60 * 60'),
  )
  assert.throws(
    () => assertSpecsEqual([{ label: 'solana', spec: anc() }, { label: 'shared', spec: badGrace }]),
    /parity mismatch in "limits"/,
  )
})

test('assertSpecsEqual requires at least two specs', () => {
  assert.throws(() => assertSpecsEqual([{ label: 'only', spec: sol() }]), /at least two specs/)
})

// --- parser fail-loud negatives (missing declarations) ---

test('parseSolidity throws when the Status enum is missing', () => {
  assert.throws(() => parseSolidity('uint8 public constant KIND_GIG = 0;'), /enum "Status" not found/)
})

test('parseSolidity throws when a required constant is missing', () => {
  assert.throws(() => parseSolidity(SOLIDITY.replace('MAX_PLATFORM_FEE_BPS', 'RENAMED')), /constant "MAX_PLATFORM_FEE_BPS" not found/)
})

test('parseSolana throws when an enum is missing', () => {
  assert.throws(() => parseSolana('pub enum EscrowKind { Gig = 0 }', SOLANA_CONSTANTS), /enum "EscrowStatus" not found/)
})

test('parseSharedConstants throws when an array/object is missing', () => {
  assert.throws(() => parseSharedConstants('export const ESCROW_KIND_CODE = { gig: 0, exchange: 1 }'), /array "ESCROW_STATUS_ORDER" not found/)
})

// --- the litesvm LIMITS mirror guard ---

const TEST_LIMITS_SRC = `
  export const LIMITS = {
    maxPlatformFeeBps: 1_000,
    minApprovalWindowSeconds: 3_600,
    maxApprovalWindowSeconds: 30 * 24 * 3_600,
    minGracePeriodSeconds: 0,
    maxGracePeriodSeconds: 14 * 24 * 3_600,
    minCompletionDurationSeconds: 3_600,
    maxCompletionDurationSeconds: 180 * 24 * 3_600,
    minUnassignWindowSeconds: 0,
    maxUnassignWindowSeconds: 24 * 3_600,
  } as const;
`

test('parseTestLimits reads the litesvm mirror and evaluates its products', () => {
  const limits = parseTestLimits(TEST_LIMITS_SRC)
  assert.equal(limits.maxUnassignWindowSeconds, 86400)
  assert.equal(limits.maxCompletionDurationSeconds, 15552000)
})

test('assertLimitsEqual passes when every canonical limit is mirrored', () => {
  assert.doesNotThrow(() =>
    assertLimitsEqual(shr().limits, parseTestLimits(TEST_LIMITS_SRC), 'solana-tests'),
  )
})

test('assertLimitsEqual tolerates chain-specific EXTRA keys', () => {
  // minGracePeriodSeconds is Solana-only (its field is i64, so a negative is
  // representable); ESCROW_LIMITS omits it because the EVM field is uint64.
  const limits = parseTestLimits(TEST_LIMITS_SRC)
  assert.ok('minGracePeriodSeconds' in limits)
  assert.doesNotThrow(() => assertLimitsEqual(shr().limits, limits, 'solana-tests'))
})

test('assertLimitsEqual catches a stale mirrored value', () => {
  const stale = { ...parseTestLimits(TEST_LIMITS_SRC), maxUnassignWindowSeconds: 43_200 }
  assert.throws(
    () => assertLimitsEqual(shr().limits, stale, 'solana-tests'),
    /maxUnassignWindowSeconds=43200, canonical=86400/,
  )
})

test('assertLimitsEqual catches a canonical limit the mirror never added', () => {
  const limits = parseTestLimits(TEST_LIMITS_SRC)
  delete limits.maxUnassignWindowSeconds
  assert.throws(
    () => assertLimitsEqual(shr().limits, limits, 'solana-tests'),
    /missing "maxUnassignWindowSeconds"/,
  )
})
