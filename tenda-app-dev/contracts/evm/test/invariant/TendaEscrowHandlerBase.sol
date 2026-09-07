// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TendaEscrow} from "../../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "../mocks/MockUSDCPermitV2.sol";
import {AuthorizationSigning} from "../helpers/AuthorizationSigning.sol";

/// @dev Shared plumbing for the invariant handler: the actor set (private-key
///      derived so real EIP-2612 / EIP-3009 signatures can be produced with
///      vm.sign), the ghost model (expected status + funds accounting the
///      invariants compare against the chain), and the escrow-picking /
///      signing helpers. Actions live in TendaEscrowHandler.
abstract contract TendaEscrowHandlerBase is AuthorizationSigning {
    TendaEscrow internal escrowC;
    MockUSDCPermitV2 internal token;
    address internal admin;
    address internal disputeAdmin;
    address internal treasury;

    uint256 internal constant ACTOR_COUNT = 6;
    uint256 internal constant TOKEN_FUND = 1e30;
    uint256 internal constant NATIVE_FUND = 1e27;
    /// @dev Escrow amounts/bonds stay far below funds ÷ max depth so an
    ///      actor can never run dry mid-sequence (which would turn a valid
    ///      action into an unexpected revert under fail_on_revert).
    uint256 internal constant MAX_AMOUNT = 1e24;

    uint256[ACTOR_COUNT] internal actorKeys;
    address[ACTOR_COUNT] internal actors;

    /// @dev Ghost mirror of every escrow the handler created. The
    ///      model-equivalence invariant asserts the chain never diverges
    ///      from this record — any drift between our understanding of the
    ///      state machine and the contract's fails the run.
    struct Ghost {
        TendaEscrow.Status status;
        bool erc20;
        uint256 amount;
        uint256 bond;
        address creator;
        address counterparty;
        address assigned;
        bool isSeeker;
        uint64 acceptDeadline;
        uint64 duration;
        uint64 completionDeadline;
        uint64 approvalDeadline;
        address raisedBy;
        /// @dev Approval mode: acceptEscrow is closed, the creator drives
        ///      assignAccept/unassign instead.
        bool requiresApproval;
        uint64 unassignWindow;
        bool terminal;
    }

    bytes16[] public ids;
    mapping(bytes16 => Ghost) public ghosts;
    uint128 internal idCounter;

    // Funds model (the solvency/fee invariants' expected values).
    uint256 public tokenLiabilities;
    uint256 public nativeLiabilities;
    uint256 public tokenFees;
    uint256 public nativeFees;

    constructor(
        TendaEscrow escrow_,
        MockUSDCPermitV2 token_,
        address admin_,
        address disputeAdmin_,
        address treasury_
    ) {
        escrowC = escrow_;
        token = token_;
        admin = admin_;
        disputeAdmin = disputeAdmin_;
        treasury = treasury_;
        for (uint256 i = 0; i < ACTOR_COUNT; i++) {
            actorKeys[i] = uint256(keccak256(abi.encodePacked("tenda-invariant-actor", i)));
            actors[i] = vm.addr(actorKeys[i]);
            vm.deal(actors[i], NATIVE_FUND);
            token.mint(actors[i], TOKEN_FUND);
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function ghostOf(bytes16 id) external view returns (Ghost memory) {
        return ghosts[id];
    }

    function totalMinted() public pure returns (uint256) {
        return ACTOR_COUNT * TOKEN_FUND;
    }

    function totalNativeFunded() public pure returns (uint256) {
        return ACTOR_COUNT * NATIVE_FUND;
    }

    function actorList() external view returns (address[ACTOR_COUNT] memory) {
        return actors;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _actor(uint256 seed) internal view returns (uint256 pk, address addr) {
        uint256 i = seed % ACTOR_COUNT;
        return (actorKeys[i], actors[i]);
    }

    function _nextId() internal returns (bytes16) {
        idCounter += 1;
        return bytes16(idCounter);
    }

    /// @dev Pick the seed-th escrow currently in `wanted` status; zero id
    ///      when none exists (callers no-op — an empty pool is not a bug).
    function _pick(uint256 seed, TendaEscrow.Status wanted) internal view returns (bytes16) {
        uint256 n = ids.length;
        if (n == 0) return bytes16(0);
        uint256 start = seed % n; // reduce FIRST — seed can be max uint256
        for (uint256 k = 0; k < n; k++) {
            bytes16 id = ids[(start + k) % n];
            Ghost storage g = ghosts[id];
            if (!g.terminal && g.status == wanted) return id;
        }
        return bytes16(0);
    }

    /// @dev Sign a real EIP-2612 permit for the invariant token (name
    ///      "USDC", version "2" — same domain the manifest declares).
    function _signPermit(uint256 ownerPk, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (TendaEscrow.Permit memory)
    {
        return signPermit(token, ownerPk, owner, address(escrowC), value, deadline);
    }

    /// @dev Sign the EIP-3009 authorization createEscrowFor consumes for `p`:
    ///      exact amount, nonce = hash of the params, valid from the previous
    ///      second.
    function _signAuthorization(uint256 signerPk, address signer, TendaEscrow.CreateParams memory p)
        internal
        view
        returns (TendaEscrow.Authorization memory)
    {
        return signAuthorization(
            token,
            signerPk,
            signer,
            address(escrowC),
            p.amount,
            escrowC.authorizationNonce(p),
            block.timestamp - 1,
            block.timestamp + 15 minutes
        );
    }

    /// @dev Ghost bookkeeping for a successful create.
    /// @dev Mode fields, recorded separately so `_recordCreate`'s parameter
    ///      list does not keep growing with every create-time field.
    function _recordMode(bytes16 id, bool requiresApproval, uint64 unassignWindow) internal {
        Ghost storage g = ghosts[id];
        g.requiresApproval = requiresApproval;
        g.unassignWindow = unassignWindow;
    }

    function _recordCreate(
        bytes16 id,
        bool erc20,
        uint256 amount,
        uint256 bond,
        address creator,
        address assigned,
        bool isSeeker,
        uint64 acceptDeadline,
        uint64 duration
    ) internal {
        ids.push(id);
        Ghost storage g = ghosts[id];
        g.status = TendaEscrow.Status.Open;
        g.erc20 = erc20;
        g.amount = amount;
        g.bond = bond;
        g.creator = creator;
        g.assigned = assigned;
        g.isSeeker = isSeeker;
        g.acceptDeadline = acceptDeadline;
        g.duration = duration;
        if (erc20) tokenLiabilities += amount;
        else nativeLiabilities += amount;
    }

    /// @dev Principal leaves the contract with no fee (cancel / refund /
    ///      reclaim / creator-wins / split — split's rounding stays inside
    ///      the two payouts, so liability drops by the full amount).
    function _recordPrincipalOut(Ghost storage g, TendaEscrow.Status to) internal {
        if (g.erc20) tokenLiabilities -= g.amount;
        else nativeLiabilities -= g.amount;
        g.status = to;
        g.terminal = true;
    }

    /// @dev Settlement to the counterparty (approve / claim-stalled): the
    ///      fee is computed with the LIVE bps at settlement time — exactly
    ///      like the contract — so mid-flight setFeeBps changes are modelled.
    function _recordSettlement(Ghost storage g) internal {
        uint256 fee = (g.amount * (g.isSeeker ? escrowC.seekerFeeBps() : escrowC.feeBps())) / 10_000;
        if (g.erc20) {
            tokenLiabilities -= g.amount;
            tokenFees += fee;
        } else {
            nativeLiabilities -= g.amount;
            nativeFees += fee;
        }
        g.status = TendaEscrow.Status.Completed;
        g.terminal = true;
    }

    function _recordDispute(Ghost storage g, address raiser) internal {
        if (g.erc20) tokenLiabilities += g.bond;
        else nativeLiabilities += g.bond;
        g.status = TendaEscrow.Status.Disputed;
        g.raisedBy = raiser;
    }

    function _recordResolve(Ghost storage g, uint8 winner) internal {
        uint256 out = g.amount + g.bond;
        uint256 fee = 0;
        if (winner == escrowC.WINNER_COUNTERPARTY()) {
            fee = (g.amount * (g.isSeeker ? escrowC.seekerFeeBps() : escrowC.feeBps())) / 10_000;
        }
        if (g.erc20) {
            tokenLiabilities -= out;
            tokenFees += fee;
        } else {
            nativeLiabilities -= out;
            nativeFees += fee;
        }
        g.status = TendaEscrow.Status.Resolved;
        g.terminal = true;
    }
}
