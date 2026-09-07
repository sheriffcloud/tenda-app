// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../src/TendaEscrow.sol";
import {EscrowParams} from "./helpers/EscrowParams.sol";

/// @dev Acceptance modes: approval (creator assigns, worker signs nothing to
///      start) and the unassign window that follows. Native-asset only —
///      the mode logic is asset-independent, and the ERC-20 paths are already
///      covered by TendaEscrow.t.sol.
contract TendaEscrowApprovalTest is Test {
    TendaEscrow internal escrow;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal worker = makeAddr("worker");
    address internal worker2 = makeAddr("worker2");
    address internal outsider = makeAddr("outsider");

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant BOND = 0.1 ether;
    uint64 internal constant ACCEPT_WINDOW = 1 days;
    uint64 internal constant DURATION = 2 hours;
    uint64 internal constant UNASSIGN_WINDOW = 6 hours;
    uint64 internal constant APPROVAL_WINDOW = 48 hours;
    uint64 internal constant GRACE = 1 hours;
    bytes32 internal constant PROOF = keccak256("proof");

    uint128 private nonce;

    function setUp() public {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, 250, 100, APPROVAL_WINDOW, GRACE);
        vm.deal(creator, 100 ether);
        vm.deal(worker, 100 ether);
        vm.deal(outsider, 100 ether);
    }

    function newId() internal returns (bytes16) {
        nonce += 1;
        return bytes16(nonce);
    }

    function baseParams(bytes16 id) internal view returns (TendaEscrow.CreateParams memory) {
        return EscrowParams.base(
            id, 0, address(0), AMOUNT, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
        );
    }

    /// Approval-mode escrow, funded and Open.
    function createApproval(bytes16 id, uint64 unassignWindow) internal {
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(EscrowParams.approval(baseParams(id), unassignWindow));
    }

    /// Instant-mode escrow, funded and Open.
    function createInstant(bytes16 id) internal {
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(baseParams(id));
    }

    /// Approval-mode escrow already assigned to `worker`.
    function assigned(bytes16 id) internal {
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(creator);
        escrow.assignAccept(id, worker);
    }

    // ---------------------------------------------------------------------
    // create — mode validation
    // ---------------------------------------------------------------------

    function test_create_approvalMode_storesModeFields() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertTrue(e.requiresApproval);
        assertEq(e.unassignWindowSeconds, UNASSIGN_WINDOW);
        assertEq(uint8(e.status), 0); // Open
    }

    function test_create_defaultsToInstantMode() public {
        bytes16 id = newId();
        createInstant(id);
        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertFalse(e.requiresApproval);
        assertEq(e.unassignWindowSeconds, 0);
    }

    /// The three modes are mutually exclusive: pre-assigning a worker AND
    /// requiring approval is contradictory, and must not be storable.
    function test_create_rejects_approvalModeWithPreassignedWorker() public {
        bytes16 id = newId();
        TendaEscrow.CreateParams memory p = EscrowParams.invite(baseParams(id), worker);
        p = EscrowParams.approval(p, UNASSIGN_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.ApprovalModeCannotPreassign.selector);
        escrow.createEscrow{value: AMOUNT}(p);
    }

    function test_create_rejects_unassignWindowAboveMax() public {
        bytes16 id = newId();
        uint64 tooLong = escrow.MAX_UNASSIGN_WINDOW_SECONDS() + 1;
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.UnassignWindowOutOfRange.selector);
        escrow.createEscrow{value: AMOUNT}(EscrowParams.approval(baseParams(id), tooLong));
    }

    function test_create_acceptsUnassignWindowAtMax() public {
        bytes16 id = newId();
        createApproval(id, escrow.MAX_UNASSIGN_WINDOW_SECONDS());
        assertEq(escrow.getEscrow(id).unassignWindowSeconds, escrow.MAX_UNASSIGN_WINDOW_SECONDS());
    }

    /// A window is only meaningful in approval mode, but an instant-mode
    /// escrow carrying one is still bounds-checked — the guard is on the
    /// field, not on the mode, so it cannot be bypassed by flipping the flag.
    function test_create_boundsWindowEvenInInstantMode() public {
        bytes16 id = newId();
        TendaEscrow.CreateParams memory p = baseParams(id);
        p.unassignWindowSeconds = escrow.MAX_UNASSIGN_WINDOW_SECONDS() + 1;
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.UnassignWindowOutOfRange.selector);
        escrow.createEscrow{value: AMOUNT}(p);
    }

    // ---------------------------------------------------------------------
    // acceptEscrow — closed in approval mode
    // ---------------------------------------------------------------------

    function test_accept_revertsOnApprovalModeEscrow() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.ApprovalRequired.selector);
        escrow.acceptEscrow(id);
    }

    function test_accept_stillWorksOnInstantEscrow() public {
        bytes16 id = newId();
        createInstant(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        assertEq(uint8(escrow.getEscrow(id).status), 1); // Accepted
    }

    // ---------------------------------------------------------------------
    // assignAccept
    // ---------------------------------------------------------------------

    function test_assignAccept_movesToAccepted_andEmits() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);

        vm.expectEmit(true, true, true, true);
        emit TendaEscrow.CounterpartyAssigned(id, worker, creator, uint64(block.timestamp) + DURATION);
        vm.prank(creator);
        escrow.assignAccept(id, worker);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), 1); // Accepted
        assertEq(e.counterparty, worker);
        assertEq(e.completionDeadline, uint64(block.timestamp) + DURATION);
    }

    /// assignAccept must be the exact state change acceptEscrow makes, minus
    /// the worker's signature — otherwise the two modes diverge downstream.
    function test_assignAccept_matchesAcceptEscrowStateChange() public {
        bytes16 instantId = newId();
        createInstant(instantId);
        vm.prank(worker);
        escrow.acceptEscrow(instantId);

        bytes16 approvalId = newId();
        createApproval(approvalId, UNASSIGN_WINDOW);
        vm.prank(creator);
        escrow.assignAccept(approvalId, worker);

        TendaEscrow.Escrow memory a = escrow.getEscrow(instantId);
        TendaEscrow.Escrow memory b = escrow.getEscrow(approvalId);
        assertEq(uint8(a.status), uint8(b.status));
        assertEq(a.counterparty, b.counterparty);
        assertEq(a.completionDeadline, b.completionDeadline);
    }

    function test_assignAccept_revertsForNonCreator() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.assignAccept(id, worker);
    }

    function test_assignAccept_revertsOnInstantModeEscrow() public {
        bytes16 id = newId();
        createInstant(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotApprovalMode.selector);
        escrow.assignAccept(id, worker);
    }

    function test_assignAccept_revertsAssigningCreator() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.CannotAssignCreator.selector);
        escrow.assignAccept(id, creator);
    }

    /// The one place a counterparty arrives as an ARGUMENT rather than as
    /// msg.sender, so the one place a zero address can slip in. Assigning it
    /// would move the escrow to Accepted with a counterparty nobody controls.
    function test_assignAccept_revertsOnZeroWorker() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.ZeroCounterparty.selector);
        escrow.assignAccept(id, address(0));
    }

    function test_assignAccept_revertsAfterAcceptDeadline() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.warp(block.timestamp + ACCEPT_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.AcceptDeadlinePassed.selector);
        escrow.assignAccept(id, worker);
    }

    function test_assignAccept_revertsWhenAlreadyAccepted() public {
        bytes16 id = newId();
        assigned(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.assignAccept(id, worker2);
    }

    function test_assignAccept_revertsForUnknownEscrow() public {
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.EscrowNotFound.selector);
        escrow.assignAccept(bytes16(uint128(0xdead)), worker);
    }

    // ---------------------------------------------------------------------
    // unassign
    // ---------------------------------------------------------------------

    function test_unassign_returnsEscrowToOpen_andEmits() public {
        bytes16 id = newId();
        assigned(id);

        vm.expectEmit(true, true, true, true);
        emit TendaEscrow.AssignmentReleased(id, worker, creator);
        vm.prank(creator);
        escrow.unassign(id);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), 0); // Open
        assertEq(e.counterparty, address(0));
        assertEq(e.completionDeadline, 0);
    }

    function test_unassign_leavesFundsEscrowed() public {
        bytes16 id = newId();
        assigned(id);
        uint256 balanceBefore = address(escrow).balance;
        vm.prank(creator);
        escrow.unassign(id);
        assertEq(address(escrow).balance, balanceBefore);
        assertEq(escrow.getEscrow(id).amount, AMOUNT);
    }

    function test_unassign_allowsReassignment() public {
        bytes16 id = newId();
        assigned(id);
        vm.prank(creator);
        escrow.unassign(id);
        vm.prank(creator);
        escrow.assignAccept(id, worker2);
        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.counterparty, worker2);
        assertEq(uint8(e.status), 1); // Accepted
    }

    /// THE safety property: a worker who signed acceptEscrow themselves can
    /// never be unassigned, at any time. `requiresApproval` is the on-chain
    /// witness that the worker was placed rather than that they consented.
    function test_unassign_revertsOnWorkerAcceptedEscrow() public {
        bytes16 id = newId();
        createInstant(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotApprovalMode.selector);
        escrow.unassign(id);
    }

    /// Direct invite is still the worker's own acceptEscrow, so it inherits
    /// the same protection.
    function test_unassign_revertsOnDirectInviteAcceptedEscrow() public {
        bytes16 id = newId();
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(EscrowParams.invite(baseParams(id), worker));
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotApprovalMode.selector);
        escrow.unassign(id);
    }

    function test_unassign_revertsForNonCreator() public {
        bytes16 id = newId();
        assigned(id);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.unassign(id);
    }

    function test_unassign_succeedsJustInsideWindow() public {
        bytes16 id = newId();
        assigned(id);
        vm.warp(block.timestamp + UNASSIGN_WINDOW - 1);
        vm.prank(creator);
        escrow.unassign(id);
        assertEq(uint8(escrow.getEscrow(id).status), 0); // Open
    }

    /// The boundary is exclusive: at exactly acceptedAt + window it is shut.
    function test_unassign_revertsAtExactWindowBoundary() public {
        bytes16 id = newId();
        assigned(id);
        vm.warp(block.timestamp + UNASSIGN_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.UnassignWindowClosed.selector);
        escrow.unassign(id);
    }

    function test_unassign_revertsAfterWindow() public {
        bytes16 id = newId();
        assigned(id);
        vm.warp(block.timestamp + UNASSIGN_WINDOW + 1);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.UnassignWindowClosed.selector);
        escrow.unassign(id);
    }

    /// A zero window means the assignment is final immediately.
    function test_unassign_zeroWindowIsImmediatelyClosed() public {
        bytes16 id = newId();
        createApproval(id, 0);
        vm.prank(creator);
        escrow.assignAccept(id, worker);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.UnassignWindowClosed.selector);
        escrow.unassign(id);
    }

    /// The window runs from ASSIGNMENT, not from creation — an escrow that sat
    /// Open for longer than the window must still be unassignable once
    /// assigned. This is what `_acceptedAt`'s derivation buys.
    function test_unassign_windowRunsFromAssignmentNotCreation() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.warp(block.timestamp + UNASSIGN_WINDOW * 2);
        vm.prank(creator);
        escrow.assignAccept(id, worker);
        vm.prank(creator);
        escrow.unassign(id);
        assertEq(uint8(escrow.getEscrow(id).status), 0); // Open
    }

    function test_unassign_revertsAfterSubmission() public {
        bytes16 id = newId();
        assigned(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.unassign(id);
    }

    function test_unassign_revertsWhileOpen() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.unassign(id);
    }

    function test_unassign_revertsForUnknownEscrow() public {
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.EscrowNotFound.selector);
        escrow.unassign(bytes16(uint128(0xbeef)));
    }

    // ---------------------------------------------------------------------
    // downstream lifecycle is unchanged by the mode
    // ---------------------------------------------------------------------

    /// The whole point of approval mode: the worker signs exactly ONE
    /// transaction (submitProof) for a completed gig.
    function test_approvalMode_fullLifecycle_workerSignsOnlySubmit() public {
        bytes16 id = newId();
        assigned(id);
        uint256 workerBefore = worker.balance;

        vm.prank(worker);
        escrow.submitProof(id, PROOF);
        vm.prank(creator);
        escrow.approveCompletion(id);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), 3); // Completed
        assertEq(worker.balance, workerBefore + AMOUNT - (AMOUNT * 250) / 10_000);
    }

    function test_approvalMode_reclaimAbandonedStillWorks() public {
        bytes16 id = newId();
        assigned(id);
        uint256 creatorBefore = creator.balance;
        vm.warp(block.timestamp + DURATION + GRACE + 1);
        vm.prank(creator);
        escrow.reclaimAbandoned(id);
        assertEq(uint8(escrow.getEscrow(id).status), 5); // Refunded
        assertEq(creator.balance, creatorBefore + AMOUNT);
    }

    function test_approvalMode_disputeStillWorks() public {
        bytes16 id = newId();
        assigned(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);
        vm.prank(creator);
        escrow.disputeEscrow{value: BOND}(id);
        assertEq(uint8(escrow.getEscrow(id).status), 6); // Disputed
    }

    /// After an unassign the escrow is Open again, so the creator's ordinary
    /// exit (cancel + full refund) must be available — no funds stranded.
    function test_unassign_thenCancelRefundsCreator() public {
        bytes16 id = newId();
        assigned(id);
        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        escrow.unassign(id);
        vm.prank(creator);
        escrow.cancelEscrow(id);
        assertEq(uint8(escrow.getEscrow(id).status), 4); // Cancelled
        assertEq(creator.balance, creatorBefore + AMOUNT);
    }

    /// An approval-mode escrow nobody was ever assigned to must still expire
    /// back to the creator.
    function test_approvalMode_refundExpiredStillWorks() public {
        bytes16 id = newId();
        createApproval(id, UNASSIGN_WINDOW);
        uint256 creatorBefore = creator.balance;
        vm.warp(block.timestamp + ACCEPT_WINDOW + 1);
        vm.prank(creator);
        escrow.refundExpired(id);
        assertEq(uint8(escrow.getEscrow(id).status), 5); // Refunded
        assertEq(creator.balance, creatorBefore + AMOUNT);
    }
}
