// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../src/TendaEscrow.sol";
import {EscrowParams} from "./helpers/EscrowParams.sol";

/// @dev A party that refuses ETH — the push-payment griefing actor the
///      contract's AUDIT NOTE reasons about. Thin call-forwarders so it can
///      play creator or counterparty.
contract RejectingParty {
    TendaEscrow private immutable esc;

    constructor(TendaEscrow esc_) {
        esc = esc_;
    }

    receive() external payable {
        revert("no ETH accepted");
    }

    function create(bytes16 id, uint256 amount, uint64 acceptDeadline, uint64 duration, uint256 bond) external payable {
        esc.createEscrow{value: amount}(
            EscrowParams.base(id, 0, address(0), amount, address(0), acceptDeadline, duration, bond, false)
        );
    }

    function accept(bytes16 id) external {
        esc.acceptEscrow(id);
    }

    function submit(bytes16 id) external {
        esc.submitProof(id, keccak256("proof"));
    }

    function approve(bytes16 id) external {
        esc.approveCompletion(id);
    }

    function cancel(bytes16 id) external {
        esc.cancelEscrow(id);
    }

    function refundExpired(bytes16 id) external {
        esc.refundExpired(id);
    }

    function claim(bytes16 id) external {
        esc.claimStalledPayment(id);
    }

    function dispute(bytes16 id) external payable {
        esc.disputeEscrow{value: msg.value}(id);
    }
}

/// @title Push-payment griefing, exact deadline boundaries, admin rotation
///        mid-lifecycle — the assessment gaps the main suite didn't cover.
contract TendaEscrowEdgesTest is Test {
    TendaEscrow internal escrow;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal worker = makeAddr("worker");

    uint16 internal constant FEE_BPS = 250;
    uint64 internal constant APPROVAL_WINDOW = 48 hours;
    uint64 internal constant GRACE = 1 hours;
    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant BOND = 0.1 ether;
    uint64 internal constant ACCEPT_WINDOW = 1 days;
    uint64 internal constant DURATION = 2 hours;

    uint128 private idCounter;

    function setUp() public {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, FEE_BPS, 100, APPROVAL_WINDOW, GRACE);
        vm.deal(creator, 100 ether);
        vm.deal(worker, 100 ether);
    }

    function newId() internal returns (bytes16) {
        idCounter += 1;
        return bytes16(idCounter);
    }

    function createNative(bytes16 id) internal {
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(
                id, 0, address(0), AMOUNT, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );
    }

    // ---------------------------------------------------------------------
    // Push-payment griefing (the AUDIT NOTE claim, now machine-checked)
    // ---------------------------------------------------------------------

    /// @dev A counterparty that refuses ETH blocks every payout to itself
    ///      (approve, claim, counterparty-wins, split) — but the dispute
    ///      always stays resolvable via CREATOR-wins. The escrow exits.
    function test_rejectingCounterparty_blocksOnlyItself_creatorWinsExits() public {
        RejectingParty cp = new RejectingParty(escrow);
        bytes16 id = newId();
        createNative(id);
        cp.accept(id);
        cp.submit(id);

        // Both settlement paths push ETH to the rejecting counterparty.
        vm.prank(creator);
        vm.expectRevert();
        escrow.approveCompletion(id);
        vm.warp(block.timestamp + APPROVAL_WINDOW);
        vm.expectRevert();
        cp.claim(id);

        // Escalate: creator raises, posting the bond.
        vm.prank(creator);
        escrow.disputeEscrow{value: BOND}(id);

        // Payout-to-counterparty resolutions are blocked by the griefer…
        vm.prank(disputeAdmin);
        vm.expectRevert();
        escrow.resolveDispute(id, 1); // WINNER_COUNTERPARTY
        vm.prank(disputeAdmin);
        vm.expectRevert();
        escrow.resolveDispute(id, 2); // WINNER_SPLIT pays cp half

        // …but creator-wins pays only the creator: the dispute resolves.
        uint256 before = creator.balance;
        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 0); // WINNER_CREATOR
        assertEq(creator.balance - before, AMOUNT + BOND, "creator-wins must return principal + bond");
    }

    /// @dev A creator that refuses ETH can only grief ITSELF: its refund
    ///      paths revert, but the flow-through to the counterparty (approve
    ///      settlement, counterparty-wins resolution) still executes.
    function test_rejectingCreator_selfGriefOnly_counterpartyPathsExecute() public {
        RejectingParty cr = new RejectingParty(escrow);
        vm.deal(address(cr), 10 ether);
        bytes16 id = newId();
        cr.create{value: 0}(id, AMOUNT, uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND);

        // Self-grief: every refund-to-creator path reverts.
        vm.expectRevert();
        cr.cancel(id);

        // Flow-through: worker accepts, submits; the rejecting creator can
        // still APPROVE (payout goes to the worker + treasury, not to it).
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, keccak256("proof"));
        uint256 workerBefore = worker.balance;
        cr.approve(id);
        uint256 fee = (AMOUNT * FEE_BPS) / 10_000;
        assertEq(worker.balance - workerBefore, AMOUNT - fee, "settlement must reach the counterparty");
        assertEq(treasury.balance, fee, "fee must reach the treasury");
    }

    /// @dev Disputed with a rejecting creator: split (pays creator half)
    ///      reverts, counterparty-wins (pays cp + forfeits bond to cp)
    ///      executes — the "at least one executable resolution" guarantee
    ///      from the other side.
    function test_rejectingCreator_dispute_counterpartyWinsExits() public {
        RejectingParty cr = new RejectingParty(escrow);
        vm.deal(address(cr), 10 ether);
        bytes16 id = newId();
        cr.create{value: 0}(id, AMOUNT, uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        cr.dispute{value: BOND}(id);

        vm.prank(disputeAdmin);
        vm.expectRevert();
        escrow.resolveDispute(id, 2); // split pays the rejecting creator half

        uint256 before = worker.balance;
        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 1); // WINNER_COUNTERPARTY
        uint256 fee = (AMOUNT * FEE_BPS) / 10_000;
        assertEq(worker.balance - before, AMOUNT - fee + BOND, "cp-wins must pay principal - fee + forfeited bond");
    }

    // ---------------------------------------------------------------------
    // Exact deadline boundaries (Rust parity: accept/submit strictly-before,
    // refund/reclaim/claim at-or-after — verified against the Anchor gates)
    // ---------------------------------------------------------------------

    function test_boundary_acceptDeadline_acceptRejects_refundSucceeds_sameSecond() public {
        bytes16 id = newId();
        createNative(id);
        vm.warp(block.timestamp + ACCEPT_WINDOW); // exactly acceptDeadline

        vm.prank(worker);
        vm.expectRevert(TendaEscrow.AcceptDeadlinePassed.selector);
        escrow.acceptEscrow(id);

        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.refundExpired(id);
        assertEq(creator.balance - before, AMOUNT);
    }

    function test_boundary_submitCutoff_submitRejects_reclaimSucceeds_sameSecond() public {
        bytes16 id = newId();
        createNative(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.warp(block.timestamp + DURATION + GRACE); // exactly completionDeadline + grace

        vm.prank(worker);
        vm.expectRevert(TendaEscrow.SubmissionWindowClosed.selector);
        escrow.submitProof(id, keccak256("proof"));

        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.reclaimAbandoned(id);
        assertEq(creator.balance - before, AMOUNT);
    }

    function test_boundary_approvalDeadline_claimRejectsBefore_succeedsAtExactSecond() public {
        bytes16 id = newId();
        createNative(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, keccak256("proof"));

        vm.warp(block.timestamp + APPROVAL_WINDOW - 1);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.ApprovalDeadlineNotPassed.selector);
        escrow.claimStalledPayment(id);

        vm.warp(block.timestamp + 1); // exactly approvalDeadline
        uint256 before = worker.balance;
        vm.prank(worker);
        escrow.claimStalledPayment(id);
        assertEq(worker.balance - before, AMOUNT - (AMOUNT * FEE_BPS) / 10_000);
    }

    // ---------------------------------------------------------------------
    // Admin rotation × in-flight escrows
    // ---------------------------------------------------------------------

    function test_treasuryRotation_midLifecycle_feeGoesToNewTreasury() public {
        bytes16 id = newId();
        createNative(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, keccak256("proof"));

        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        escrow.setTreasury(newTreasury);

        vm.prank(creator);
        escrow.approveCompletion(id);
        assertEq(newTreasury.balance, (AMOUNT * FEE_BPS) / 10_000, "fee must follow the LIVE treasury");
        assertEq(treasury.balance, 0, "old treasury must receive nothing");
    }

    function test_disputeAdminRotation_midDispute_onlyNewAdminResolves() public {
        bytes16 id = newId();
        createNative(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.disputeEscrow{value: BOND}(id);

        address newDisputeAdmin = makeAddr("newDisputeAdmin");
        vm.prank(admin);
        escrow.setDisputeAdmin(newDisputeAdmin);

        vm.prank(disputeAdmin); // the OLD authority
        vm.expectRevert(TendaEscrow.NotDisputeAdmin.selector);
        escrow.resolveDispute(id, 0);

        vm.prank(newDisputeAdmin);
        escrow.resolveDispute(id, 0);
    }
}
