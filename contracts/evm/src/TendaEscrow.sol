// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC3009} from "./IERC3009.sol";

/// @title TendaEscrow — chain-agnostic escrow primitive (EVM mirror)
/// @notice Mirrors the Solana Anchor program 1:1 (stage-3-base.md):
///         same status machine, deadlines, fee math, dispute-bond flow and
///         event vocabulary. One deliberate divergence: `raisedBy` is
///         recorded on-chain at dispute time (storage is cheap on EVM), so
///         `resolveDispute` needs no off-chain raiser attestation — the
///         Anchor program passes the raiser as an instruction argument
///         instead.
/// @dev    Funds semantics:
///         - `asset == address(0)` → native (ETH on BASE, CELO on Celo).
///         - otherwise ERC-20 via SafeERC20: caller approves first, OR uses
///           the *WithPermit entry points (EIP-2612 — allowance rides the
///           same tx; USDC supports it, cUSD does not).
///         - RELAYED create (createEscrowFor / createEscrowForWithPermit):
///           a third party pays the gas, the funds are pulled from the
///           signer of an EIP-3009 authorization (or an EIP-2612 permit),
///           and THAT SIGNER is the creator — msg.sender is never a party.
///           The 3009 nonce is the hash of the whole CreateParams, so one
///           signature funds exactly one draft on exactly its terms.
///         The dispute bond is denominated in the SAME asset as the escrow
///         (exactly like the Anchor vaults).
///
///         ASSET TRUST MODEL (explicit non-goal): createEscrow is
///         permissionless in `asset`, but the protocol only SUPPORTS the
///         server-registered asset list (vanilla ERC-20s: USDC, cUSD).
///         Fee-on-transfer, rebasing, or transfer-reverting tokens are NOT
///         supported: such an escrow can strand or grief only its own
///         parties' funds — never another escrow's (per-escrow accounting,
///         no shared pot beyond exact balances; see the invariant suite's
///         solvency checks).
///
///         AUDIT NOTE (push-payment griefing): native payouts use
///         Address.sendValue, so a contract party that reverts on receive
///         blocks only payouts *to itself* (self-grief). The one shared
///         path is a SPLIT resolution (pays both parties + raiser): if one
///         side refuses ETH the admin resolves to a single-winner outcome
///         instead — every dispute always has at least one executable
///         resolution. Pull-payments were deliberately not introduced
///         pre-audit; revisit with the auditor.
contract TendaEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @dev Numbering matches the Anchor `EscrowStatus` enum exactly so the
    ///      server adapter shares one wire mapping across chains.
    enum Status {
        Open, // 0
        Accepted, // 1
        Submitted, // 2
        Completed, // 3
        Cancelled, // 4
        Refunded, // 5
        Disputed, // 6
        Resolved // 7
    }

    /// @dev 0=gig, 1=exchange — informational; the server enforces per-kind
    ///      asset policy off-chain (mirrors Anchor).
    uint8 public constant KIND_GIG = 0;
    uint8 public constant KIND_EXCHANGE = 1;

    /// @dev resolveDispute winner encoding (matches Anchor DisputeWinner).
    uint8 public constant WINNER_CREATOR = 0;
    uint8 public constant WINNER_COUNTERPARTY = 1;
    uint8 public constant WINNER_SPLIT = 2;

    /// @dev EIP-2612 signature bundle for the *WithPermit entry points.
    ///      `value` is the exact amount the owner signed (must cover the
    ///      transfer — the server validates off-chain; transferFrom enforces
    ///      on-chain). ERC-20 assets only.
    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev EIP-3009 `ReceiveWithAuthorization` signature bundle for
    ///      createEscrowFor. `value` and `nonce` are NOT fields: the contract
    ///      derives them (value = params.amount, nonce = a hash of the WHOLE
    ///      params, see `authorizationNonce`), so a relayer — or a stranger who
    ///      lifted the signature — cannot pull a different amount, aim it at a
    ///      different draft, or alter a single term: the token's signature
    ///      check fails on any change.
    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Create-time inputs, grouped so the four entry points (createEscrow,
    ///      createEscrowWithPermit, createEscrowFor, createEscrowForWithPermit)
    ///      and the shared _validate/_store declare the parameter list ONCE.
    ///      Mirrors the Anchor `CreateEscrowArgs` struct field-for-field, so
    ///      the two chains stay readable side by side.
    struct CreateParams {
        bytes16 escrowId;
        uint8 kind;
        address asset;
        uint256 amount;
        address assignedCounterparty;
        uint64 acceptDeadline;
        uint64 completionDuration;
        uint256 disputeBond;
        bool isSeeker;
        /// @dev Acceptance mode. See `Escrow.requiresApproval`.
        bool requiresApproval;
        /// @dev See `Escrow.unassignWindowSeconds`.
        uint64 unassignWindowSeconds;
    }

    struct Escrow {
        bytes16 escrowId;
        uint8 kind;
        address asset;
        uint256 amount;
        address creator;
        address counterparty;
        address assignedCounterparty;
        Status status;
        uint64 acceptDeadline;
        uint64 completionDuration;
        uint64 completionDeadline;
        uint64 approvalDeadline;
        uint256 disputeBond;
        bool isSeeker;
        /// @dev Set by disputeEscrow; consumed by resolveDispute (split
        ///      refunds the bond to the raiser).
        address raisedBy;
        /// @dev Acceptance mode, fixed at create.
        ///      false → the worker moves the escrow to Accepted themselves via
        ///        acceptEscrow (open first-come, or restricted to
        ///        assignedCounterparty when that is set).
        ///      true  → acceptEscrow is closed; only the creator can move it,
        ///        via assignAccept.
        ///      The two guards make the mode an EXACT witness of provenance:
        ///      `status == Accepted && requiresApproval` is true if and only if
        ///      the creator assigned the worker, i.e. the worker never signed.
        ///      unassign relies on that equivalence, so a worker who accepted
        ///      of their own accord can never be unassigned.
        bool requiresApproval;
        /// @dev How long after assignAccept the creator may still unassign.
        ///      Per-escrow (a term of THIS deal, fixed when it is posted)
        ///      rather than a mutable platform-wide value, so changing the
        ///      default never retroactively re-opens a settled assignment.
        ///      Server-supplied from `platform_config`; bounded on-chain by
        ///      MIN/MAX_UNASSIGN_WINDOW_SECONDS exactly like completionDuration.
        ///      Only meaningful when requiresApproval is true.
        uint64 unassignWindowSeconds;
    }

    // ---------------------------------------------------------------------
    // Platform parameters (bounds mirror the Anchor constants)
    // ---------------------------------------------------------------------

    uint16 public constant MAX_PLATFORM_FEE_BPS = 1_000;
    uint64 public constant MIN_APPROVAL_WINDOW_SECONDS = 3_600;
    uint64 public constant MAX_APPROVAL_WINDOW_SECONDS = 30 days;
    uint64 public constant MAX_GRACE_PERIOD_SECONDS = 14 days;
    uint64 public constant MIN_COMPLETION_DURATION_SECONDS = 3_600;
    uint64 public constant MAX_COMPLETION_DURATION_SECONDS = 180 days;
    /// @dev A zero window is allowed: it means "assignment is final the moment
    ///      it is made", which is a legitimate poster choice.
    uint64 public constant MIN_UNASSIGN_WINDOW_SECONDS = 0;
    /// @dev Capped well below the shortest completion duration so an unassign
    ///      window can never span a whole gig — past this point the creator
    ///      must use the normal reclaim path instead of yanking the worker.
    uint64 public constant MAX_UNASSIGN_WINDOW_SECONDS = 1 days;

    /// @notice Safe 3-of-5 — protocol params, treasury, dispute-admin rotation.
    address public admin;
    /// @notice SEPARATE authority — only signs resolveDispute (decision #17).
    address public disputeAdmin;
    address public treasury;
    uint16 public feeBps;
    uint16 public seekerFeeBps;
    uint64 public approvalWindowSeconds;
    uint64 public gracePeriodSeconds;

    mapping(bytes16 => Escrow) public escrows;

    /// @notice Who may spend an EIP-2612 permit on a signer's behalf
    ///         (createEscrowForWithPermit). A permit binds an allowance and
    ///         nothing else — not the draft's terms — so only an operator the
    ///         admin vouches for (Tenda's relayer, which relays exactly the
    ///         draft its signer created) may turn one into an escrow. The
    ///         EIP-3009 path needs no such list: its nonce binds every term.
    mapping(address => bool) public relayers;

    // ---------------------------------------------------------------------
    // Events (stage-3 spec vocabulary — the listener's standing signals)
    // ---------------------------------------------------------------------

    // Arg names are snake_case where the Anchor program's event fields are:
    // the server decoder passes them through verbatim as the cross-chain
    // field vocabulary (events.rs promises the mirror; applications.ts keys
    // on these exact names). Settlement events carry the chain-attested
    // amounts — payouts are NET of the platform fee, refunds are the exact
    // amount returned — so off-chain history never reconstructs them.
    event EscrowCreated(bytes16 indexed escrowId, address indexed creator, uint8 kind, address asset, uint256 amount);
    /// @dev Provenance of a RELAYED create, emitted beside EscrowCreated: the
    ///      creator is the authorization/permit signer, the relayer the gas
    ///      payer. Off-chain readers that do not know this event skip it.
    event EscrowCreatedFor(bytes16 indexed escrowId, address indexed creator, address indexed relayer);
    event EscrowAccepted(bytes16 indexed escrowId, address indexed counterparty, uint64 completion_deadline);
    event EscrowDeclined(bytes16 indexed escrowId, address indexed declined_by);
    /// @dev Approval-mode counterpart of EscrowAccepted: the creator, not the
    ///      worker, moved the escrow to Accepted. Kept a DISTINCT event (rather
    ///      than reusing EscrowAccepted) because the actor differs — a wallet
    ///      history must not label the poster's transaction "Gig accepted".
    event CounterpartyAssigned(
        bytes16 indexed escrowId, address indexed counterparty, address indexed assigned_by, uint64 completion_deadline
    );
    /// @dev The creator withdrew an assignment inside the unassign window; the
    ///      escrow returns to Open with its funds untouched.
    event AssignmentReleased(bytes16 indexed escrowId, address indexed counterparty, address indexed released_by);
    event ProofSubmitted(bytes16 indexed escrowId, bytes32 proof_hash, uint64 timestamp, uint64 approval_deadline);
    event EscrowApproved(
        bytes16 indexed escrowId, address indexed creator, address counterparty, uint256 amount, uint256 platform_fee
    );
    event PaymentClaimed(bytes16 indexed escrowId, address indexed counterparty, uint256 amount, uint256 platform_fee);
    event EscrowCancelled(bytes16 indexed escrowId, address indexed creator, uint256 refund_amount);
    event EscrowExpired(bytes16 indexed escrowId, address indexed creator, uint256 refund_amount);
    event EscrowAbandoned(
        bytes16 indexed escrowId, address indexed creator, address counterparty, uint256 refund_amount
    );
    event DisputeRaised(bytes16 indexed escrowId, address indexed raised_by, uint256 bond_amount);
    /// @dev Payouts are the PRINCIPAL shares only (mirror of Anchor's
    ///      compute_distribution); the bond flow is reported separately —
    ///      bond_refund_to is address(0) when the bond forfeits to the
    ///      winning party rather than returning to its raiser.
    event DisputeResolved(
        bytes16 indexed escrowId,
        uint8 winner,
        uint256 creator_payout,
        uint256 counterparty_payout,
        uint256 platform_fee,
        address bond_refund_to,
        uint256 bond_amount
    );
    event PlatformConfigChanged(string parameter, address indexed changedBy);
    event RelayerSet(address indexed relayer, bool allowed, address indexed changedBy);

    // ---------------------------------------------------------------------
    // Errors (typed — mirror the Anchor TendaError vocabulary)
    // ---------------------------------------------------------------------

    error NotAdmin();
    error NotDisputeAdmin();
    error NotCreator();
    error NotCounterparty();
    error NotDisputeParty();
    error NotAssignedCounterparty();
    error CannotAcceptOwnEscrow();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error InvalidEscrowStatus();
    error InvalidKind();
    error AmountTooLow();
    error AcceptDeadlineInPast();
    error AcceptDeadlinePassed();
    error AcceptDeadlineNotPassed();
    error CompletionDurationOutOfRange();
    error SubmissionWindowClosed();
    error ApprovalDeadlineNotPassed();
    error ReclaimWindowNotOpen();
    error DisputeBondMismatch();
    error InvalidWinner();
    error BadNativeValue();
    error NativeAssetPermit();
    error NativeAssetAuthorization();
    error NotRelayer();
    error FeeBpsOutOfRange();
    error SeekerFeeAboveFee();
    error ApprovalWindowOutOfRange();
    error GracePeriodOutOfRange();
    error ZeroAddress();
    error ApprovalRequired();
    error NotApprovalMode();
    error CannotAssignCreator();
    error ZeroCounterparty();
    error UnassignWindowClosed();
    error UnassignWindowOutOfRange();
    error ApprovalModeCannotPreassign();

    // ---------------------------------------------------------------------
    // Constructor / admin
    // ---------------------------------------------------------------------

    constructor(
        address admin_,
        address disputeAdmin_,
        address treasury_,
        uint16 feeBps_,
        uint16 seekerFeeBps_,
        uint64 approvalWindowSeconds_,
        uint64 gracePeriodSeconds_
    ) {
        if (admin_ == address(0) || disputeAdmin_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        _validateFeeBps(feeBps_, seekerFeeBps_);
        _validateApprovalWindow(approvalWindowSeconds_);
        _validateGracePeriod(gracePeriodSeconds_);
        admin = admin_;
        disputeAdmin = disputeAdmin_;
        treasury = treasury_;
        feeBps = feeBps_;
        seekerFeeBps = seekerFeeBps_;
        approvalWindowSeconds = approvalWindowSeconds_;
        gracePeriodSeconds = gracePeriodSeconds_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function setProtocolAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
        emit PlatformConfigChanged("protocol_admin", msg.sender);
    }

    function setDisputeAdmin(address newDisputeAdmin) external onlyAdmin {
        if (newDisputeAdmin == address(0)) revert ZeroAddress();
        disputeAdmin = newDisputeAdmin;
        emit PlatformConfigChanged("dispute_admin", msg.sender);
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit PlatformConfigChanged("treasury", msg.sender);
    }

    function setFeeBps(uint16 newFeeBps, uint16 newSeekerFeeBps) external onlyAdmin {
        _validateFeeBps(newFeeBps, newSeekerFeeBps);
        feeBps = newFeeBps;
        seekerFeeBps = newSeekerFeeBps;
        emit PlatformConfigChanged("fee_bps", msg.sender);
    }

    function setApprovalWindow(uint64 newWindowSeconds) external onlyAdmin {
        _validateApprovalWindow(newWindowSeconds);
        approvalWindowSeconds = newWindowSeconds;
        emit PlatformConfigChanged("approval_window_seconds", msg.sender);
    }

    function setGracePeriod(uint64 newGraceSeconds) external onlyAdmin {
        _validateGracePeriod(newGraceSeconds);
        gracePeriodSeconds = newGraceSeconds;
        emit PlatformConfigChanged("grace_period_seconds", msg.sender);
    }

    /// @notice Allow or revoke a permit relayer (see `relayers`).
    function setRelayer(address relayer, bool allowed) external onlyAdmin {
        if (relayer == address(0)) revert ZeroAddress();
        relayers[relayer] = allowed;
        emit RelayerSet(relayer, allowed, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice Create and fund an escrow. Native: `msg.value == amount`.
    ///         ERC-20: approve first; the bond (if any) is collected later
    ///         from whoever raises a dispute — exactly like the Anchor
    ///         program (the stage-doc's "amount + disputeBond" at create is
    ///         stale; the payable disputeEscrow below is the live design).
    function createEscrow(CreateParams calldata params) external payable nonReentrant {
        _validate(params);
        _collect(params.asset, params.amount);
        _store(params, msg.sender);
    }

    /// @notice createEscrow with an EIP-2612 permit riding the same tx — no
    ///         separate approve. ERC-20 assets only (native funds via
    ///         msg.value and needs no allowance).
    function createEscrowWithPermit(CreateParams calldata params, Permit calldata permit_) external nonReentrant {
        if (params.asset == address(0)) revert NativeAssetPermit();
        _applyPermit(msg.sender, params.asset, permit_);
        _validate(params);
        _collect(params.asset, params.amount);
        _store(params, msg.sender);
    }

    /// @notice Relayed create, funded by an EIP-3009 authorization that
    ///         `creator` signed: the caller pays gas, the token pulls
    ///         `params.amount` from `creator` via receiveWithAuthorization,
    ///         and `creator` — never msg.sender — becomes the escrow's
    ///         creator. ERC-20 assets only.
    /// @dev    The token verifies the signature against `creator`, so a relayer
    ///         cannot substitute a signer; `to` is this contract, so a lifted
    ///         authorization cannot be redeemed elsewhere; `value` and `nonce`
    ///         are derived from `params`, so the signed amount and EVERY term
    ///         are exactly what gets created — a front-runner can at most pay
    ///         the gas for the escrow the signer asked for. Parameters are
    ///         validated BEFORE the pull so a rejected draft leaves the
    ///         authorization unused.
    function createEscrowFor(address creator, CreateParams calldata params, Authorization calldata auth)
        external
        nonReentrant
    {
        if (creator == address(0)) revert ZeroAddress();
        if (params.asset == address(0)) revert NativeAssetAuthorization();
        _validate(params);
        IERC3009(params.asset)
            .receiveWithAuthorization(
                creator,
                address(this),
                params.amount,
                auth.validAfter,
                auth.validBefore,
                authorizationNonce(params),
                auth.v,
                auth.r,
                auth.s
            );
        _store(params, creator);
        emit EscrowCreatedFor(params.escrowId, creator, msg.sender);
    }

    /// @notice Relayed create for stables without EIP-3009: `creator` signed
    ///         an EIP-2612 permit for this contract, the caller pays gas and
    ///         the funds are pulled from `creator`, who becomes the creator.
    /// @dev    Same best-effort permit as createEscrowWithPermit (a front-run
    ///         permit still leaves the allowance in place). Unlike the 3009
    ///         path a permit binds NOTHING about the draft — a stranger who
    ///         lifted it, or who merely found a standing allowance, could
    ///         otherwise lock the signer's funds behind terms of their own —
    ///         so only an allow-listed relayer may call this, and it relays
    ///         only the draft its signer created.
    function createEscrowForWithPermit(address creator, CreateParams calldata params, Permit calldata permit_)
        external
        nonReentrant
    {
        if (!relayers[msg.sender]) revert NotRelayer();
        if (creator == address(0)) revert ZeroAddress();
        if (params.asset == address(0)) revert NativeAssetPermit();
        _applyPermit(creator, params.asset, permit_);
        _validate(params);
        IERC20(params.asset).safeTransferFrom(creator, address(this), params.amount);
        _store(params, creator);
        emit EscrowCreatedFor(params.escrowId, creator, msg.sender);
    }

    /// @notice The EIP-3009 nonce an authorization for `params` must carry:
    ///         the keccak256 of the ABI-encoded CreateParams. It carries the
    ///         draft id AND every other term, which is what makes the signature
    ///         un-alterable by whoever relays it. One place the rule is
    ///         spelled, callable by whoever builds the signature.
    function authorizationNonce(CreateParams calldata params) public pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }

    function _validate(CreateParams calldata p) private view {
        if (p.kind > KIND_EXCHANGE) revert InvalidKind();
        if (p.amount == 0) revert AmountTooLow();
        if (p.acceptDeadline <= block.timestamp) revert AcceptDeadlineInPast();
        if (
            p.completionDuration < MIN_COMPLETION_DURATION_SECONDS
                || p.completionDuration > MAX_COMPLETION_DURATION_SECONDS
        ) revert CompletionDurationOutOfRange();
        if (
            p.unassignWindowSeconds < MIN_UNASSIGN_WINDOW_SECONDS
                || p.unassignWindowSeconds > MAX_UNASSIGN_WINDOW_SECONDS
        ) revert UnassignWindowOutOfRange();
        // The three acceptance modes are mutually exclusive. Pre-assigning a
        // worker AND demanding approval is contradictory (assignAccept could
        // name someone other than the invitee, leaving assignedCounterparty as
        // dead, misleading state) — reject rather than pick a winner.
        if (p.requiresApproval && p.assignedCounterparty != address(0)) revert ApprovalModeCannotPreassign();
        if (escrows[p.escrowId].creator != address(0)) revert EscrowAlreadyExists();
    }

    /// @dev Persist + announce a validated, FUNDED escrow for `creator`.
    function _store(CreateParams calldata p, address creator) private {
        escrows[p.escrowId] = Escrow({
            escrowId: p.escrowId,
            kind: p.kind,
            asset: p.asset,
            amount: p.amount,
            creator: creator,
            counterparty: address(0),
            assignedCounterparty: p.assignedCounterparty,
            status: Status.Open,
            acceptDeadline: p.acceptDeadline,
            completionDuration: p.completionDuration,
            completionDeadline: 0,
            approvalDeadline: 0,
            disputeBond: p.disputeBond,
            isSeeker: p.isSeeker,
            raisedBy: address(0),
            requiresApproval: p.requiresApproval,
            unassignWindowSeconds: p.unassignWindowSeconds
        });

        emit EscrowCreated(p.escrowId, creator, p.kind, p.asset, p.amount);
    }

    /// @notice The whole escrow record as a named struct.
    /// @dev    The auto-generated `escrows` getter FLATTENS the struct into a
    ///         positional tuple, so every off-chain and in-test read had to
    ///         count commas and silently mis-decoded whenever a field was
    ///         added. This returns the struct itself: readers address fields
    ///         by name and are unaffected by future additions. Returns a
    ///         zero-valued struct for an unknown id (`creator == address(0)`
    ///         is the existence test, same as `_mustExist` uses).
    function getEscrow(bytes16 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function acceptEscrow(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Open) revert InvalidEscrowStatus();
        if (e.requiresApproval) revert ApprovalRequired();
        if (msg.sender == e.creator) revert CannotAcceptOwnEscrow();
        if (block.timestamp >= e.acceptDeadline) revert AcceptDeadlinePassed();
        if (e.assignedCounterparty != address(0) && msg.sender != e.assignedCounterparty) {
            revert NotAssignedCounterparty();
        }

        e.counterparty = msg.sender;
        e.status = Status.Accepted;
        e.completionDeadline = uint64(block.timestamp) + e.completionDuration;

        emit EscrowAccepted(escrowId, msg.sender, e.completionDeadline);
    }

    /// @notice Approval mode: the creator picks a worker and moves the escrow
    ///         to Accepted in one transaction, so the worker signs nothing to
    ///         start (their only tx is submitProof). Deliberately the exact
    ///         state change acceptEscrow makes, minus the worker's signature.
    function assignAccept(bytes16 escrowId, address worker) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Open) revert InvalidEscrowStatus();
        if (!e.requiresApproval) revert NotApprovalMode();
        if (msg.sender != e.creator) revert NotCreator();
        if (worker == address(0)) revert ZeroCounterparty();
        if (worker == e.creator) revert CannotAssignCreator();
        if (block.timestamp >= e.acceptDeadline) revert AcceptDeadlinePassed();

        e.counterparty = worker;
        e.status = Status.Accepted;
        e.completionDeadline = uint64(block.timestamp) + e.completionDuration;

        emit CounterpartyAssigned(escrowId, worker, msg.sender, e.completionDeadline);
    }

    /// @notice Withdraw an assignment made by assignAccept, returning the
    ///         escrow to Open with funds untouched so it can be re-assigned.
    /// @dev    `requiresApproval` gates this: it is the on-chain witness that
    ///         the worker was PLACED rather than that they accepted. A worker
    ///         who signed acceptEscrow themselves is therefore unreachable
    ///         here, at any time. Submitted work is excluded too, since that
    ///         is a distinct status.
    function unassign(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Accepted) revert InvalidEscrowStatus();
        if (!e.requiresApproval) revert NotApprovalMode();
        if (msg.sender != e.creator) revert NotCreator();
        if (block.timestamp >= _acceptedAt(e) + e.unassignWindowSeconds) revert UnassignWindowClosed();

        address released = e.counterparty;
        e.counterparty = address(0);
        e.status = Status.Open;
        e.completionDeadline = 0;

        emit AssignmentReleased(escrowId, released, msg.sender);
    }

    /// @dev When an escrow was accepted is not stored: both accept paths set
    ///      `completionDeadline = acceptedAt + completionDuration`, so the
    ///      timestamp is recoverable exactly. Only valid while the escrow is
    ///      Accepted — before that `completionDeadline` is 0 and this
    ///      underflows, which every caller here excludes by status first.
    function _acceptedAt(Escrow storage e) private view returns (uint64) {
        return e.completionDeadline - e.completionDuration;
    }

    function declineAssignedEscrow(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Open) revert InvalidEscrowStatus();
        if (e.assignedCounterparty == address(0)) revert NotAssignedCounterparty();
        if (msg.sender != e.assignedCounterparty) revert NotAssignedCounterparty();

        e.assignedCounterparty = address(0);
        // Status STAYS Open; funds stay escrowed; gig becomes public.
        emit EscrowDeclined(escrowId, msg.sender);
    }

    function submitProof(bytes16 escrowId, bytes32 proofHash) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Accepted) revert InvalidEscrowStatus();
        if (msg.sender != e.counterparty) revert NotCounterparty();
        if (block.timestamp >= e.completionDeadline + gracePeriodSeconds) revert SubmissionWindowClosed();

        e.approvalDeadline = uint64(block.timestamp) + approvalWindowSeconds;
        e.status = Status.Submitted;

        emit ProofSubmitted(escrowId, proofHash, uint64(block.timestamp), e.approvalDeadline);
    }

    function approveCompletion(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidEscrowStatus();
        if (msg.sender != e.creator) revert NotCreator();

        e.status = Status.Completed;
        (uint256 payout, uint256 fee) = _settleToCounterparty(e);

        emit EscrowApproved(escrowId, e.creator, e.counterparty, payout, fee);
    }

    /// @notice Counterparty self-serve payout after the creator ghosted the
    ///         approval window. Creator CANNOT call this — their post-submit
    ///         paths are approveCompletion or disputeEscrow only.
    function claimStalledPayment(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidEscrowStatus();
        if (msg.sender != e.counterparty) revert NotCounterparty();
        if (block.timestamp < e.approvalDeadline) revert ApprovalDeadlineNotPassed();

        e.status = Status.Completed;
        (uint256 payout, uint256 fee) = _settleToCounterparty(e);

        emit PaymentClaimed(escrowId, msg.sender, payout, fee);
    }

    function cancelEscrow(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Open) revert InvalidEscrowStatus();
        if (msg.sender != e.creator) revert NotCreator();

        e.status = Status.Cancelled;
        _payout(e.asset, e.creator, e.amount);

        emit EscrowCancelled(escrowId, e.creator, e.amount);
    }

    /// @notice "Nobody wanted the work" — Open past acceptDeadline.
    ///
    /// @dev PERMISSIONLESS by design (#43). Anyone may trigger it; nobody can
    ///      redirect it, because the payout address is `e.creator` and never
    ///      `msg.sender`. Two facts make opening the caller safe rather than
    ///      merely convenient:
    ///        * the condition is objective — a timestamp, not a judgement;
    ///        * the escrow is already dead at that timestamp, since
    ///          acceptEscrow reverts once acceptDeadline passes. Sweeping it
    ///          removes no option any party still had.
    ///      Left creator-only, the creator's own funds sit locked until they
    ///      come back and pay gas to release them to themselves — and an agent
    ///      that crashed never comes back. cancelEscrow is deliberately NOT
    ///      opened the same way: it withdraws a LIVE listing and has no time
    ///      condition, so a stranger calling it would be destroying a gig.
    function refundExpired(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Open) revert InvalidEscrowStatus();
        if (block.timestamp < e.acceptDeadline) revert AcceptDeadlineNotPassed();

        e.status = Status.Refunded;
        _payout(e.asset, e.creator, e.amount);

        emit EscrowExpired(escrowId, e.creator, e.amount);
    }

    /// @notice "Worker took the job and ghosted" — Accepted past
    ///         completionDeadline + grace. Submitted is explicitly excluded.
    ///
    /// @dev PERMISSIONLESS on the same terms as refundExpired (#43): pays
    ///      `e.creator`, never `msg.sender`. The window it opens on is the very
    ///      boundary at which submitProof stops accepting work, so by the time
    ///      anyone may call this the counterparty can no longer deliver — the
    ///      refund takes nothing from them that they had not already lost.
    function reclaimAbandoned(bytes16 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Accepted) revert InvalidEscrowStatus();
        if (block.timestamp < e.completionDeadline + gracePeriodSeconds) revert ReclaimWindowNotOpen();

        e.status = Status.Refunded;
        _payout(e.asset, e.creator, e.amount);

        emit EscrowAbandoned(escrowId, e.creator, e.counterparty, e.amount);
    }

    /// @notice Either party escalates. The raiser posts the bond in the
    ///         escrow's asset (native via msg.value, ERC-20 via approve +
    ///         transferFrom) — mirrors the Anchor vault flow.
    function disputeEscrow(bytes16 escrowId) external payable nonReentrant {
        Escrow storage e = _disputable(escrowId);

        if (e.asset == address(0)) {
            if (msg.value != e.disputeBond) revert DisputeBondMismatch();
        } else {
            if (msg.value != 0) revert BadNativeValue();
            _collectBond(e);
        }

        _raiseDispute(e, escrowId);
    }

    /// @notice disputeEscrow with an EIP-2612 permit covering the ERC-20
    ///         bond — no separate approve. ERC-20 escrows only.
    function disputeEscrowWithPermit(bytes16 escrowId, Permit calldata permit_) external nonReentrant {
        Escrow storage e = _disputable(escrowId);
        if (e.asset == address(0)) revert NativeAssetPermit();

        _applyPermit(msg.sender, e.asset, permit_);
        _collectBond(e);

        _raiseDispute(e, escrowId);
    }

    function _disputable(bytes16 escrowId) private view returns (Escrow storage e) {
        e = _mustExist(escrowId);
        if (e.status != Status.Accepted && e.status != Status.Submitted) revert InvalidEscrowStatus();
        if (msg.sender != e.creator && msg.sender != e.counterparty) revert NotDisputeParty();
    }

    function _collectBond(Escrow storage e) private {
        if (e.disputeBond > 0) {
            IERC20(e.asset).safeTransferFrom(msg.sender, address(this), e.disputeBond);
        }
    }

    function _raiseDispute(Escrow storage e, bytes16 escrowId) private {
        e.status = Status.Disputed;
        e.raisedBy = msg.sender;

        emit DisputeRaised(escrowId, msg.sender, e.disputeBond);
    }

    /// @notice dispute_admin distributes principal + bond per outcome
    ///         (mirrors the Anchor compute_distribution exactly):
    ///         - Creator wins:      principal + bond → creator (no fee).
    ///           (raiser==creator → bond refund; raiser==counterparty →
    ///           loser's bond forfeits to creator. Same destination.)
    ///         - Counterparty wins: principal − fee + bond → counterparty,
    ///           fee → treasury.
    ///         - Split:             principal halved, no fee; bond refunded
    ///           to whoever raised.
    function resolveDispute(bytes16 escrowId, uint8 winner) external nonReentrant {
        if (msg.sender != disputeAdmin) revert NotDisputeAdmin();
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidEscrowStatus();
        if (winner > WINNER_SPLIT) revert InvalidWinner();

        e.status = Status.Resolved;
        uint256 bond = e.disputeBond;

        // Event payouts mirror Anchor's compute_distribution: principal
        // shares only, bond reported via bond_refund_to (address(0) when it
        // forfeits to the winning party instead of returning to its raiser).
        uint256 creatorPayout;
        uint256 counterpartyPayout;
        uint256 fee;
        address bondRefundTo;

        if (winner == WINNER_CREATOR) {
            creatorPayout = e.amount;
            if (e.raisedBy == e.creator) bondRefundTo = e.creator;
            _payout(e.asset, e.creator, e.amount + bond);
        } else if (winner == WINNER_COUNTERPARTY) {
            fee = _fee(e.amount, e.isSeeker);
            counterpartyPayout = e.amount - fee;
            if (e.raisedBy == e.counterparty) bondRefundTo = e.counterparty;
            _payout(e.asset, e.counterparty, counterpartyPayout + bond);
            if (fee > 0) _payout(e.asset, treasury, fee);
        } else {
            uint256 half = e.amount / 2;
            creatorPayout = half;
            counterpartyPayout = e.amount - half;
            bondRefundTo = e.raisedBy;
            _payout(e.asset, e.creator, half);
            _payout(e.asset, e.counterparty, counterpartyPayout);
            if (bond > 0) _payout(e.asset, e.raisedBy, bond);
        }

        emit DisputeResolved(escrowId, winner, creatorPayout, counterpartyPayout, fee, bondRefundTo, bond);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _mustExist(bytes16 escrowId) private view returns (Escrow storage e) {
        e = escrows[escrowId];
        if (e.creator == address(0)) revert EscrowNotFound();
    }

    /// @dev Best-effort EIP-2612: a front-runner can lift the signature from
    ///      the mempool and call token.permit directly, consuming the nonce
    ///      so this inner call reverts — but the allowance is then ALREADY
    ///      set, so the subsequent transferFrom decides. A failed permit
    ///      with no allowance still reverts there. (Standard griefing
    ///      mitigation — do NOT let the permit call bubble.)
    function _applyPermit(address owner, address asset, Permit calldata permit_) private {
        try IERC20Permit(asset)
            .permit(owner, address(this), permit_.value, permit_.deadline, permit_.v, permit_.r, permit_.s) {}
            catch {}
    }

    function _collect(address asset, uint256 amount) private {
        if (asset == address(0)) {
            if (msg.value != amount) revert BadNativeValue();
        } else {
            if (msg.value != 0) revert BadNativeValue();
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _payout(address asset, address to, uint256 amount) private {
        if (amount == 0) return;
        if (asset == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }

    /// @dev approve + claim share one settlement: amount − fee → counterparty,
    ///      fee → treasury. Floor division mirrors Anchor's compute_fee.
    ///      Returns the split so callers can attest it in their events.
    function _settleToCounterparty(Escrow storage e) private returns (uint256 payout, uint256 fee) {
        fee = _fee(e.amount, e.isSeeker);
        payout = e.amount - fee;
        _payout(e.asset, e.counterparty, payout);
        if (fee > 0) _payout(e.asset, treasury, fee);
    }

    function _fee(uint256 amount, bool isSeeker) private view returns (uint256) {
        uint16 bps = isSeeker ? seekerFeeBps : feeBps;
        return (amount * bps) / 10_000;
    }

    // ---------------------------------------------------------------------
    // Validation helpers (bounds mirror Anchor constants.rs)
    // ---------------------------------------------------------------------

    function _validateFeeBps(uint16 fee, uint16 seekerFee) private pure {
        if (fee > MAX_PLATFORM_FEE_BPS || seekerFee > MAX_PLATFORM_FEE_BPS) revert FeeBpsOutOfRange();
        // Parity with the Anchor program's validate_fee_bps
        // (SeekerFeeExceedsStandardFee): the reduced seeker fee can never
        // exceed the standard fee.
        if (seekerFee > fee) revert SeekerFeeAboveFee();
    }

    function _validateApprovalWindow(uint64 window) private pure {
        if (window < MIN_APPROVAL_WINDOW_SECONDS || window > MAX_APPROVAL_WINDOW_SECONDS) {
            revert ApprovalWindowOutOfRange();
        }
    }

    function _validateGracePeriod(uint64 grace) private pure {
        if (grace > MAX_GRACE_PERIOD_SECONDS) revert GracePeriodOutOfRange();
    }
}
