// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../src/TendaEscrow.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {EscrowParams} from "./helpers/EscrowParams.sol";

/// @dev EIP-2612 like the real thing (Circle's FiatTokenV2 implements permit)
///      so the *WithPermit paths are exercised against a genuine
///      signature-verifying token, not a stub.
contract MockUSDC is ERC20, ERC20Permit {
    constructor() ERC20("Mock USDC", "USDC") ERC20Permit("Mock USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @dev Re-enters approveCompletion from its native payout — must be
///      stopped by the reentrancy guard (and by CEI, belt-and-braces).
contract ReentrantCounterparty {
    TendaEscrow private immutable escrowC;
    bytes16 private immutable id;

    constructor(TendaEscrow escrow_, bytes16 id_) {
        escrowC = escrow_;
        id = id_;
    }

    function accept() external {
        escrowC.acceptEscrow(id);
    }

    function submit() external {
        escrowC.submitProof(id, bytes32(uint256(1)));
    }

    receive() external payable {
        // Try to double-settle. Guard must revert this inner call; the
        // outer transfer continues (low-level call ignores our revert? No —
        // Address.sendValue bubbles failures, so we must NOT revert here.
        // Instead attempt the call and swallow the failure.)
        try escrowC.claimStalledPayment(id) {} catch {}
    }
}

contract TendaEscrowTest is Test {
    TendaEscrow internal escrow;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal worker = makeAddr("worker");
    address internal outsider = makeAddr("outsider");

    uint16 internal constant FEE_BPS = 250;
    uint16 internal constant SEEKER_FEE_BPS = 100;
    uint64 internal constant APPROVAL_WINDOW = 48 hours;
    uint64 internal constant GRACE = 1 hours;

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant BOND = 0.1 ether;
    uint64 internal constant ACCEPT_WINDOW = 1 days;
    uint64 internal constant DURATION = 2 hours;

    bytes32 internal constant PROOF = keccak256("proof");

    function setUp() public {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, FEE_BPS, SEEKER_FEE_BPS, APPROVAL_WINDOW, GRACE);
        usdc = new MockUSDC();
        vm.deal(creator, 100 ether);
        vm.deal(worker, 100 ether);
        vm.deal(outsider, 100 ether);
        usdc.mint(creator, 1_000_000e6);
        usdc.mint(worker, 1_000_000e6);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    uint128 private nonce;

    function newId() internal returns (bytes16) {
        nonce += 1;
        return bytes16(nonce);
    }

    function createNative(bytes16 id) internal {
        vm.prank(creator);
        // NB literal kind — calling escrow.KIND_GIG() here would consume
        // the prank (it's a contract call) and create as the test contract.
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(
                id, 0, address(0), AMOUNT, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );
    }

    function createUsdc(bytes16 id, uint256 amount) internal {
        vm.startPrank(creator);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, 0, false
            )
        );
        vm.stopPrank();
    }

    function acceptedNative(bytes16 id) internal {
        createNative(id);
        vm.prank(worker);
        escrow.acceptEscrow(id);
    }

    function submittedNative(bytes16 id) internal {
        acceptedNative(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);
    }

    function status(bytes16 id) internal view returns (TendaEscrow.Status s) {
        s = escrow.getEscrow(id).status;
    }

    function fee(uint256 amount) internal pure returns (uint256) {
        return (amount * FEE_BPS) / 10_000;
    }

    // ---------------------------------------------------------------------
    // create
    // ---------------------------------------------------------------------

    function test_create_native_locksFunds_and_emits() public {
        bytes16 id = newId();
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowCreated(id, creator, 0, address(0), AMOUNT);
        createNative(id);
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(uint8(status(id)), 0); // Open
    }

    function test_create_erc20_pullsViaTransferFrom() public {
        bytes16 id = newId();
        createUsdc(id, 100e6);
        assertEq(usdc.balanceOf(address(escrow)), 100e6);
    }

    function test_create_guards() public {
        bytes16 id = newId();
        uint64 deadline = uint64(block.timestamp) + ACCEPT_WINDOW;

        vm.startPrank(creator);
        // kind out of range
        vm.expectRevert(TendaEscrow.InvalidKind.selector);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(id, 2, address(0), AMOUNT, address(0), deadline, DURATION, BOND, false)
        );
        // zero amount
        vm.expectRevert(TendaEscrow.AmountTooLow.selector);
        escrow.createEscrow(EscrowParams.base(id, 0, address(0), 0, address(0), deadline, DURATION, BOND, false));
        // deadline in past
        vm.expectRevert(TendaEscrow.AcceptDeadlineInPast.selector);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(id, 0, address(0), AMOUNT, address(0), uint64(block.timestamp), DURATION, BOND, false)
        );
        // duration below 1h / above 180d
        vm.expectRevert(TendaEscrow.CompletionDurationOutOfRange.selector);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(id, 0, address(0), AMOUNT, address(0), deadline, 3599, BOND, false)
        );
        vm.expectRevert(TendaEscrow.CompletionDurationOutOfRange.selector);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(id, 0, address(0), AMOUNT, address(0), deadline, 180 days + 1, BOND, false)
        );
        // wrong msg.value
        vm.expectRevert(TendaEscrow.BadNativeValue.selector);
        escrow.createEscrow{value: AMOUNT - 1}(
            EscrowParams.base(id, 0, address(0), AMOUNT, address(0), deadline, DURATION, BOND, false)
        );
        // ERC20 path must not carry value
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(TendaEscrow.BadNativeValue.selector);
        escrow.createEscrow{value: 1}(
            EscrowParams.base(id, 0, address(usdc), AMOUNT, address(0), deadline, DURATION, BOND, false)
        );
        vm.stopPrank();

        // duplicate id
        createNative(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.EscrowAlreadyExists.selector);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(id, 0, address(0), AMOUNT, address(0), deadline, DURATION, BOND, false)
        );
    }

    // ---------------------------------------------------------------------
    // accept / decline
    // ---------------------------------------------------------------------

    function test_accept_setsCounterpartyAndCompletionDeadline() public {
        bytes16 id = newId();
        createNative(id);
        vm.prank(worker);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowAccepted(id, worker, uint64(block.timestamp) + DURATION);
        escrow.acceptEscrow(id);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        address cp = e.counterparty;
        uint64 completion = e.completionDeadline;
        assertEq(cp, worker);
        assertEq(completion, uint64(block.timestamp) + DURATION);
        assertEq(uint8(status(id)), 1); // Accepted
    }

    function test_accept_guards() public {
        bytes16 id = newId();
        createNative(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.CannotAcceptOwnEscrow.selector);
        escrow.acceptEscrow(id);

        vm.warp(block.timestamp + ACCEPT_WINDOW);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.AcceptDeadlinePassed.selector);
        escrow.acceptEscrow(id);

        vm.prank(worker);
        vm.expectRevert(TendaEscrow.EscrowNotFound.selector);
        escrow.acceptEscrow(newId());
    }

    function test_assigned_onlyAssigneeCanAccept_thenDeclineOpensIt() public {
        bytes16 id = newId();
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(
                id, 0, address(0), AMOUNT, worker, uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );

        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotAssignedCounterparty.selector);
        escrow.acceptEscrow(id);

        // Decline clears the assignment; status stays Open; funds stay.
        vm.prank(worker);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowDeclined(id, worker);
        escrow.declineAssignedEscrow(id);
        assertEq(uint8(status(id)), 0);
        assertEq(address(escrow).balance, AMOUNT);

        // Now a third party can accept.
        vm.prank(outsider);
        escrow.acceptEscrow(id);
        assertEq(uint8(status(id)), 1);
    }

    function test_decline_guards() public {
        bytes16 open = newId();
        createNative(open); // no assignment
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.NotAssignedCounterparty.selector);
        escrow.declineAssignedEscrow(open);

        bytes16 id = newId();
        vm.prank(creator);
        escrow.createEscrow{value: AMOUNT}(
            EscrowParams.base(
                id, 0, address(0), AMOUNT, worker, uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotAssignedCounterparty.selector);
        escrow.declineAssignedEscrow(id);
    }

    // ---------------------------------------------------------------------
    // submit / approve / claim
    // ---------------------------------------------------------------------

    function test_submit_setsApprovalDeadline() public {
        bytes16 id = newId();
        acceptedNative(id);
        vm.prank(worker);
        vm.expectEmit(true, false, false, true);
        emit TendaEscrow.ProofSubmitted(id, PROOF, uint64(block.timestamp), uint64(block.timestamp) + APPROVAL_WINDOW);
        escrow.submitProof(id, PROOF);
        uint64 approval = escrow.getEscrow(id).approvalDeadline;
        assertEq(approval, uint64(block.timestamp) + APPROVAL_WINDOW);
    }

    function test_submit_guards() public {
        bytes16 id = newId();
        acceptedNative(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotCounterparty.selector);
        escrow.submitProof(id, PROOF);

        // Submission window closes after completionDeadline + grace.
        vm.warp(block.timestamp + DURATION + GRACE);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.SubmissionWindowClosed.selector);
        escrow.submitProof(id, PROOF);
    }

    function test_approve_paysCounterpartyMinusFee_feeToTreasury() public {
        bytes16 id = newId();
        submittedNative(id);
        uint256 workerBefore = worker.balance;

        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowApproved(id, creator, worker, AMOUNT - fee(AMOUNT), fee(AMOUNT));
        escrow.approveCompletion(id);

        assertEq(worker.balance - workerBefore, AMOUNT - fee(AMOUNT));
        assertEq(treasury.balance, fee(AMOUNT));
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(status(id)), 3); // Completed
    }

    function test_approve_erc20_seekerFee() public {
        bytes16 id = newId();
        uint256 amount = 100e6;
        vm.startPrank(creator);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id,
                0,
                address(usdc),
                amount,
                address(0),
                uint64(block.timestamp) + ACCEPT_WINDOW,
                DURATION,
                0,
                true // isSeeker
            )
        );
        vm.stopPrank();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);

        vm.prank(creator);
        escrow.approveCompletion(id);

        uint256 seekerFee = (amount * SEEKER_FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(treasury), seekerFee);
        assertEq(usdc.balanceOf(worker), 1_000_000e6 + amount - seekerFee);
    }

    function test_approve_guards() public {
        bytes16 id = newId();
        submittedNative(id);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.approveCompletion(id);

        bytes16 openId = newId();
        createNative(openId);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.approveCompletion(openId);
    }

    function test_claimStalled_afterApprovalWindow() public {
        bytes16 id = newId();
        submittedNative(id);

        // Too early.
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.ApprovalDeadlineNotPassed.selector);
        escrow.claimStalledPayment(id);

        vm.warp(block.timestamp + APPROVAL_WINDOW);
        uint256 workerBefore = worker.balance;
        vm.prank(worker);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.PaymentClaimed(id, worker, AMOUNT - fee(AMOUNT), fee(AMOUNT));
        escrow.claimStalledPayment(id);

        assertEq(worker.balance - workerBefore, AMOUNT - fee(AMOUNT));
        assertEq(treasury.balance, fee(AMOUNT));
        assertEq(uint8(status(id)), 3);
    }

    function test_claimStalled_creatorCannotCall() public {
        bytes16 id = newId();
        submittedNative(id);
        vm.warp(block.timestamp + APPROVAL_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotCounterparty.selector);
        escrow.claimStalledPayment(id);
    }

    // ---------------------------------------------------------------------
    // cancel / refundExpired / reclaimAbandoned
    // ---------------------------------------------------------------------

    function test_cancel_refundsCreator() public {
        bytes16 id = newId();
        createNative(id);
        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.cancelEscrow(id);
        assertEq(creator.balance - before, AMOUNT);
        assertEq(uint8(status(id)), 4); // Cancelled
    }

    function test_cancel_onlyOpen_onlyCreator() public {
        bytes16 id = newId();
        acceptedNative(id);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.cancelEscrow(id);

        bytes16 id2 = newId();
        createNative(id2);
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.cancelEscrow(id2);
    }

    function test_refundExpired_pathDistinctFromReclaim() public {
        bytes16 id = newId();
        createNative(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.AcceptDeadlineNotPassed.selector);
        escrow.refundExpired(id);

        vm.warp(block.timestamp + ACCEPT_WINDOW);
        uint256 before = creator.balance;
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowExpired(id, creator, AMOUNT);
        escrow.refundExpired(id);
        assertEq(creator.balance - before, AMOUNT);
        assertEq(uint8(status(id)), 5); // Refunded
    }

    function test_reclaimAbandoned_acceptedOnly_afterGrace() public {
        bytes16 id = newId();
        acceptedNative(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.ReclaimWindowNotOpen.selector);
        escrow.reclaimAbandoned(id);

        vm.warp(block.timestamp + DURATION + GRACE);
        uint256 before = creator.balance;
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowAbandoned(id, creator, worker, AMOUNT);
        escrow.reclaimAbandoned(id);
        assertEq(creator.balance - before, AMOUNT);
        assertEq(uint8(status(id)), 5);
    }

    function test_refundExpired_isPermissionless_andStillPaysTheCreator() public {
        // #43. An expired listing is already DEAD — acceptEscrow reverts once
        // acceptDeadline passes — so sweeping it takes no opportunity from
        // anyone. And the destination is not the caller's to choose: this pays
        // `e.creator`, never `msg.sender`, which is precisely what makes opening
        // the caller safe rather than merely convenient. The case it exists for
        // is an agent that crashed and is never coming back to click refund.
        bytes16 id = newId();
        createNative(id);
        vm.warp(block.timestamp + ACCEPT_WINDOW);

        uint256 creatorBefore = creator.balance;
        uint256 outsiderBefore = outsider.balance;
        vm.prank(outsider);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowExpired(id, creator, AMOUNT);
        escrow.refundExpired(id);

        assertEq(creator.balance - creatorBefore, AMOUNT, "the creator is paid");
        assertEq(outsider.balance, outsiderBefore, "the caller gains nothing but a gas bill");
        assertEq(uint8(status(id)), 5); // Refunded
    }

    function test_refundExpired_permissionless_stillEnforcesTheDeadline() public {
        // Opening the CALLER must not open the CONDITION: a stranger who is
        // early gets the timing error, not an ownership one.
        bytes16 id = newId();
        createNative(id);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.AcceptDeadlineNotPassed.selector);
        escrow.refundExpired(id);
    }

    function test_reclaimAbandoned_isPermissionless_andStillPaysTheCreator() public {
        // The same argument one state along: past completionDeadline + grace the
        // worker can no longer submit (submitProof reverts on that exact
        // boundary), so the engagement is over either way and the refund takes
        // nothing from them.
        bytes16 id = newId();
        acceptedNative(id);
        vm.warp(block.timestamp + DURATION + GRACE);

        uint256 creatorBefore = creator.balance;
        uint256 outsiderBefore = outsider.balance;
        vm.prank(outsider);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.EscrowAbandoned(id, creator, worker, AMOUNT);
        escrow.reclaimAbandoned(id);

        assertEq(creator.balance - creatorBefore, AMOUNT, "the creator is paid");
        assertEq(outsider.balance, outsiderBefore, "not the caller");
        assertEq(uint8(status(id)), 5);
    }

    function test_reclaimAbandoned_permissionless_stillEnforcesTheWindow() public {
        bytes16 id = newId();
        acceptedNative(id);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.ReclaimWindowNotOpen.selector);
        escrow.reclaimAbandoned(id);
    }

    function test_sweep_erc20_goesToTheCreatorToo() public {
        // The production asset is a token, and the payout branches on it — so
        // the caller change is proved on the SafeERC20 path as well, not just
        // the native one.
        bytes16 id = newId();
        createUsdc(id, 1_000e6);
        vm.warp(block.timestamp + ACCEPT_WINDOW);

        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 outsiderBefore = usdc.balanceOf(outsider);
        vm.prank(outsider);
        escrow.refundExpired(id);

        assertEq(usdc.balanceOf(creator) - creatorBefore, 1_000e6, "tokens return to the creator");
        assertEq(usdc.balanceOf(outsider), outsiderBefore, "and not to the sweeper");
    }

    function test_cancelEscrow_staysCreatorOnly_theDeliberateAsymmetry() public {
        // #43 opens the two RECOVERY paths and deliberately leaves this one
        // shut. cancelEscrow has no time condition — it withdraws a LIVE
        // listing — so a permissionless cancel would let anyone destroy a gig a
        // worker is about to accept. The other two are safe to open precisely
        // because their conditions are objective and already fatal to the
        // escrow; this one is neither.
        bytes16 id = newId();
        createNative(id);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.cancelEscrow(id);

        // Still shut once the listing has expired: the sweep path for that state
        // is refundExpired, which pays the same address anyway.
        vm.warp(block.timestamp + ACCEPT_WINDOW);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.cancelEscrow(id);
    }

    function test_reclaimAbandoned_submittedExplicitlyExcluded() public {
        bytes16 id = newId();
        submittedNative(id);
        vm.warp(block.timestamp + DURATION + GRACE + APPROVAL_WINDOW);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.reclaimAbandoned(id);
    }

    // ---------------------------------------------------------------------
    // disputes
    // ---------------------------------------------------------------------

    function disputedNative(bytes16 id, address raiser) internal {
        submittedNative(id);
        vm.prank(raiser);
        escrow.disputeEscrow{value: BOND}(id);
    }

    function test_dispute_recordsRaiser_collectsBond() public {
        bytes16 id = newId();
        submittedNative(id);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit TendaEscrow.DisputeRaised(id, creator, BOND);
        escrow.disputeEscrow{value: BOND}(id);

        assertEq(address(escrow).balance, AMOUNT + BOND);
        address raisedBy = escrow.getEscrow(id).raisedBy;
        assertEq(raisedBy, creator);
        assertEq(uint8(status(id)), 6); // Disputed
    }

    function test_dispute_guards() public {
        bytes16 id = newId();
        submittedNative(id);

        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotDisputeParty.selector);
        escrow.disputeEscrow{value: BOND}(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.DisputeBondMismatch.selector);
        escrow.disputeEscrow{value: BOND - 1}(id);

        bytes16 openId = newId();
        createNative(openId);
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.disputeEscrow{value: BOND}(openId);
    }

    function test_dispute_erc20_bondInAsset() public {
        bytes16 id = newId();
        uint256 amount = 100e6;
        uint256 bond = 10e6;
        vm.startPrank(creator);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, bond, false
            )
        );
        vm.stopPrank();
        vm.startPrank(worker);
        escrow.acceptEscrow(id);
        escrow.submitProof(id, PROOF);
        usdc.approve(address(escrow), bond);
        escrow.disputeEscrow(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(escrow)), amount + bond);
    }

    function test_resolve_creatorWins_takesAll_noFee() public {
        bytes16 id = newId();
        disputedNative(id, worker); // worker raised and loses
        uint256 before = creator.balance;

        vm.prank(disputeAdmin);
        vm.expectEmit(true, false, false, true);
        // Worker raised and lost: bond forfeits (bond_refund_to = 0), payouts
        // report the PRINCIPAL share only — the bond flow rides separately.
        emit TendaEscrow.DisputeResolved(id, 0, AMOUNT, 0, 0, address(0), BOND);
        escrow.resolveDispute(id, 0);

        // Principal + forfeited bond → creator, no fee.
        assertEq(creator.balance - before, AMOUNT + BOND);
        assertEq(treasury.balance, 0);
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(status(id)), 7); // Resolved
    }

    function test_resolve_counterpartyWins_feeTaken_bondBack() public {
        bytes16 id = newId();
        disputedNative(id, worker); // worker raised and WINS → bond refund
        uint256 before = worker.balance;

        vm.prank(disputeAdmin);
        vm.expectEmit(true, false, false, true);
        // Counterparty share is NET of the fee; the raiser won so the bond
        // returns to them (bond_refund_to = worker).
        emit TendaEscrow.DisputeResolved(id, 1, 0, AMOUNT - fee(AMOUNT), fee(AMOUNT), worker, BOND);
        escrow.resolveDispute(id, 1);

        assertEq(worker.balance - before, AMOUNT - fee(AMOUNT) + BOND);
        assertEq(treasury.balance, fee(AMOUNT));
        assertEq(address(escrow).balance, 0);
    }

    function test_resolve_creatorRaisedAndLost_bondForfeitsToCounterparty() public {
        bytes16 id = newId();
        disputedNative(id, creator);
        uint256 before = worker.balance;

        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 1);

        assertEq(worker.balance - before, AMOUNT - fee(AMOUNT) + BOND);
    }

    function test_resolve_split_halvesPrincipal_noFee_bondToRaiser() public {
        bytes16 id = newId();
        // Odd amount exercises the floor/remainder split.
        uint256 odd = 1 ether + 1;
        vm.prank(creator);
        escrow.createEscrow{value: odd}(
            EscrowParams.base(
                id, 0, address(0), odd, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);
        vm.prank(worker);
        escrow.disputeEscrow{value: BOND}(id);

        uint256 creatorBefore = creator.balance;
        uint256 workerBefore = worker.balance;
        vm.prank(disputeAdmin);
        vm.expectEmit(true, false, false, true);
        // Split: floor half to creator, remainder to counterparty, no fee,
        // bond back to its raiser (the worker).
        emit TendaEscrow.DisputeResolved(id, 2, odd / 2, odd - odd / 2, 0, worker, BOND);
        escrow.resolveDispute(id, 2);

        assertEq(creator.balance - creatorBefore, odd / 2);
        // Counterparty gets the remainder half + raiser bond refund.
        assertEq(worker.balance - workerBefore, odd - odd / 2 + BOND);
        assertEq(treasury.balance, 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_resolve_guards() public {
        bytes16 id = newId();
        disputedNative(id, creator);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.NotDisputeAdmin.selector);
        escrow.resolveDispute(id, 0);

        vm.prank(disputeAdmin);
        vm.expectRevert(TendaEscrow.InvalidWinner.selector);
        escrow.resolveDispute(id, 3);

        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 0);
        vm.prank(disputeAdmin);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.resolveDispute(id, 0); // already resolved
    }

    // ---------------------------------------------------------------------
    // admin
    // ---------------------------------------------------------------------

    function test_admin_setters_gatedAndBounded() public {
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setTreasury(outsider);

        vm.startPrank(admin);
        escrow.setTreasury(outsider);
        assertEq(escrow.treasury(), outsider);

        vm.expectRevert(TendaEscrow.FeeBpsOutOfRange.selector);
        escrow.setFeeBps(1_001, 100);

        // Anchor-parity rule (SeekerFeeExceedsStandardFee): the seeker fee
        // may equal but never exceed the standard fee.
        vm.expectRevert(TendaEscrow.SeekerFeeAboveFee.selector);
        escrow.setFeeBps(100, 250);
        escrow.setFeeBps(300, 300); // equal is allowed
        assertEq(escrow.seekerFeeBps(), 300);

        vm.expectRevert(TendaEscrow.ApprovalWindowOutOfRange.selector);
        escrow.setApprovalWindow(3_599);
        vm.expectRevert(TendaEscrow.ApprovalWindowOutOfRange.selector);
        escrow.setApprovalWindow(30 days + 1);

        vm.expectRevert(TendaEscrow.GracePeriodOutOfRange.selector);
        escrow.setGracePeriod(14 days + 1);

        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.setDisputeAdmin(address(0));

        escrow.setDisputeAdmin(outsider);
        assertEq(escrow.disputeAdmin(), outsider);

        // Admin rotation hands over the gate.
        escrow.setProtocolAdmin(outsider);
        vm.stopPrank();
        vm.prank(admin);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setTreasury(treasury);
    }

    function test_constructor_validation() public {
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        new TendaEscrow(address(0), disputeAdmin, treasury, FEE_BPS, SEEKER_FEE_BPS, APPROVAL_WINDOW, GRACE);
        vm.expectRevert(TendaEscrow.FeeBpsOutOfRange.selector);
        new TendaEscrow(admin, disputeAdmin, treasury, 1_001, SEEKER_FEE_BPS, APPROVAL_WINDOW, GRACE);
        vm.expectRevert(TendaEscrow.SeekerFeeAboveFee.selector);
        new TendaEscrow(admin, disputeAdmin, treasury, 100, 250, APPROVAL_WINDOW, GRACE);
        vm.expectRevert(TendaEscrow.ApprovalWindowOutOfRange.selector);
        new TendaEscrow(admin, disputeAdmin, treasury, FEE_BPS, SEEKER_FEE_BPS, 0, GRACE);
    }

    function test_admin_setters_successPaths_updateStateAndEmit() public {
        vm.startPrank(admin);

        vm.expectEmit(true, false, false, true);
        emit TendaEscrow.PlatformConfigChanged("fee_bps", admin);
        escrow.setFeeBps(300, 50);
        assertEq(escrow.feeBps(), 300);
        assertEq(escrow.seekerFeeBps(), 50);

        vm.expectEmit(true, false, false, true);
        emit TendaEscrow.PlatformConfigChanged("approval_window_seconds", admin);
        escrow.setApprovalWindow(24 hours);
        assertEq(escrow.approvalWindowSeconds(), 24 hours);

        vm.expectEmit(true, false, false, true);
        emit TendaEscrow.PlatformConfigChanged("grace_period_seconds", admin);
        escrow.setGracePeriod(2 hours);
        assertEq(escrow.gracePeriodSeconds(), 2 hours);

        vm.stopPrank();
    }

    function test_admin_setters_zeroAddress_and_fullGating() public {
        vm.startPrank(admin);
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.setProtocolAdmin(address(0));
        vm.stopPrank();

        // EVERY setter is admin-gated, not just the ones the rotation test hits.
        vm.startPrank(outsider);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setFeeBps(300, 50);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setApprovalWindow(24 hours);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setGracePeriod(2 hours);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setProtocolAdmin(outsider);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setDisputeAdmin(outsider);
        vm.stopPrank();
    }

    function test_wrongStatus_guards_everyTransition() public {
        bytes16 id = newId();
        acceptedNative(id); // Accepted

        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.acceptEscrow(id); // not Open
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.declineAssignedEscrow(id); // not Open
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.claimStalledPayment(id); // not Submitted
        vm.prank(creator);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.refundExpired(id); // not Open

        bytes16 id2 = newId();
        createNative(id2); // Open
        vm.prank(worker);
        vm.expectRevert(TendaEscrow.InvalidEscrowStatus.selector);
        escrow.submitProof(id2, PROOF); // not Accepted
    }

    /// @dev Replaced the pre-#43 `test_refund_and_reclaim_notCreator_reverts`,
    ///      which asserted the caller check these two paths no longer carry.
    ///      The property that MATTERS once anyone may call them is not who is
    ///      refused, it is that the money cannot follow the caller — so the
    ///      strongest version of the old case is the counterparty, the one
    ///      party with a motive, triggering it and still not being paid.
    function test_reclaimAbandoned_theWORKERMayTriggerIt_andIsStillNotPaid() public {
        bytes16 id = newId();
        acceptedNative(id);
        vm.warp(block.timestamp + DURATION + GRACE + 1);

        uint256 creatorBefore = creator.balance;
        uint256 workerBefore = worker.balance;
        vm.prank(worker);
        escrow.reclaimAbandoned(id);

        assertEq(creator.balance - creatorBefore, AMOUNT, "the creator is made whole");
        assertEq(worker.balance, workerBefore, "the counterparty who ghosted gains nothing");
        assertEq(uint8(status(id)), 5); // Refunded
    }

    function test_dispute_erc20_rejectsNativeValue() public {
        bytes16 id = newId();
        createUsdc(id, 100e6);
        vm.prank(worker);
        escrow.acceptEscrow(id);

        vm.prank(creator);
        vm.expectRevert(TendaEscrow.BadNativeValue.selector);
        escrow.disputeEscrow{value: 1}(id); // ERC-20 escrow must not carry value
    }

    function test_resolve_split_oneWeiEscrow_zeroHalfShortCircuits() public {
        // Dust boundary: amount 1 → half = 0. The creator leg must hit
        // _payout's amount==0 short-circuit (no revert, no send), the
        // counterparty gets the full wei, and the raiser gets the bond back.
        bytes16 id = newId();
        vm.prank(creator);
        escrow.createEscrow{value: 1}(
            EscrowParams.base(
                id, 0, address(0), 1, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, BOND, false
            )
        );
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.disputeEscrow{value: BOND}(id);

        uint256 creatorBefore = creator.balance;
        uint256 workerBefore = worker.balance;
        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 2); // split

        assertEq(creator.balance, creatorBefore); // half == 0 → nothing sent
        assertEq(worker.balance - workerBefore, 1 + BOND); // full wei + bond refund
        assertEq(address(escrow).balance, 0);
    }

    function test_dispute_zeroBond_resolves_zeroBondPayoutShortCircuits() public {
        // createUsdc sets disputeBond = 0: dispute pulls nothing, and the
        // resolve-time bond refund exercises _payout's amount==0 short-circuit.
        bytes16 id = newId();
        createUsdc(id, 100e6);
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.disputeEscrow(id);
        assertEq(uint8(status(id)), 6); // Disputed

        uint256 workerBefore = usdc.balanceOf(worker);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(disputeAdmin);
        escrow.resolveDispute(id, 1); // counterparty wins: payout - fee, bond refund of 0

        uint256 amount = 100e6;
        uint256 expectedFee = (amount * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee);
        assertEq(usdc.balanceOf(worker) - workerBefore, amount - expectedFee);
        assertEq(usdc.balanceOf(address(escrow)), 0); // vault drained, nothing stuck
    }

    // ---------------------------------------------------------------------
    // reentrancy
    // ---------------------------------------------------------------------

    function test_reentrancy_claimDuringApprovePayout_cannotDoubleSettle() public {
        bytes16 id = newId();
        createNative(id);
        ReentrantCounterparty attacker = new ReentrantCounterparty(escrow, id);
        attacker.accept();
        attacker.submit();

        vm.prank(creator);
        escrow.approveCompletion(id);

        // Exactly one settlement: attacker got amount - fee, treasury got
        // the fee, nothing left to drain.
        assertEq(address(attacker).balance, AMOUNT - fee(AMOUNT));
        assertEq(treasury.balance, fee(AMOUNT));
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(status(id)), 3);
    }

    // ---------------------------------------------------------------------
    // EIP-2612 permit paths (+ the no-approval negatives these flows imply)
    // ---------------------------------------------------------------------

    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    /// @dev Keyed signer (makeAddr has no private key), funded like the
    ///      standard actors.
    function newPermitOwner() internal returns (address owner, uint256 key) {
        (owner, key) = makeAddrAndKey("permitOwner");
        vm.deal(owner, 100 ether);
        usdc.mint(owner, 1_000_000e6);
    }

    /// @dev Signs against the token's own domain separator — nothing about
    ///      the domain is reconstructed by hand.
    function signPermit(uint256 ownerKey, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (TendaEscrow.Permit memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, address(escrow), value, usdc.nonces(owner), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return TendaEscrow.Permit({value: value, deadline: deadline, v: v, r: r, s: s});
    }

    function createUsdcWithPermit(bytes16 id, address owner, uint256 amount, TendaEscrow.Permit memory p) internal {
        vm.prank(owner);
        escrow.createEscrowWithPermit(
            EscrowParams.base(
                id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, 0, false
            ),
            p
        );
    }

    function test_createEscrowWithPermit_noPriorApprove_succeeds() public {
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        uint256 amount = 100e6;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount, block.timestamp + 15 minutes);

        assertEq(usdc.allowance(owner, address(escrow)), 0); // truly no prior approve
        createUsdcWithPermit(id, owner, amount, p);

        assertEq(usdc.balanceOf(address(escrow)), amount);
        assertEq(uint8(status(id)), 0); // Open
        assertEq(usdc.allowance(owner, address(escrow)), 0); // exact-value permit leaves no residue
    }

    function test_createEscrowWithPermit_frontRunConsumedSig_stillSucceeds() public {
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        uint256 amount = 100e6;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount, block.timestamp + 15 minutes);

        // Griefing attempt: anyone can lift the sig from the mempool and
        // consume it directly. The allowance lands anyway...
        vm.prank(outsider);
        usdc.permit(owner, address(escrow), p.value, p.deadline, p.v, p.r, p.s);

        // ...so the embedded (now-reverting) permit is swallowed and create
        // proceeds on the already-set allowance.
        createUsdcWithPermit(id, owner, amount, p);
        assertEq(usdc.balanceOf(address(escrow)), amount);
    }

    function test_createEscrowWithPermit_invalidSig_noAllowance_reverts() public {
        (address owner, uint256 key) = newPermitOwner();
        uint256 amount = 100e6;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount, block.timestamp + 15 minutes);
        p.s = bytes32(uint256(p.s) ^ 1); // corrupt — permit fails, no allowance

        vm.expectRevert(); // token-level: insufficient allowance at transferFrom
        createUsdcWithPermit(newId(), owner, amount, p);
    }

    function test_createEscrowWithPermit_expiredDeadline_noAllowance_reverts() public {
        (address owner, uint256 key) = newPermitOwner();
        uint256 amount = 100e6;
        uint256 deadline = block.timestamp + 15 minutes;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount, deadline);
        vm.warp(deadline + 1);

        vm.expectRevert();
        vm.prank(owner);
        escrow.createEscrowWithPermit(
            EscrowParams.base(
                newId(),
                0,
                address(usdc),
                amount,
                address(0),
                uint64(block.timestamp) + ACCEPT_WINDOW,
                DURATION,
                0,
                false
            ),
            p
        );
    }

    function test_createEscrowWithPermit_valueAboveAmount_succeedsWithResidualAllowance() public {
        // Over-permitting works but leaves spendable allowance behind — the
        // reason the server validates and clients sign EXACT values, and why
        // the in-app approvals screen surfaces residuals.
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        uint256 amount = 100e6;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount + 5e6, block.timestamp + 15 minutes);

        createUsdcWithPermit(id, owner, amount, p);

        assertEq(usdc.balanceOf(address(escrow)), amount);
        assertEq(usdc.allowance(owner, address(escrow)), 5e6); // residual
    }

    function test_createEscrowWithPermit_valueBelowAmount_reverts() public {
        (address owner, uint256 key) = newPermitOwner();
        uint256 amount = 100e6;
        TendaEscrow.Permit memory p = signPermit(key, owner, amount - 1, block.timestamp + 15 minutes);

        vm.expectRevert(); // allowance (amount-1) < amount at transferFrom
        createUsdcWithPermit(newId(), owner, amount, p);
    }

    function test_createEscrowWithPermit_nativeAsset_reverts() public {
        (address owner, uint256 key) = newPermitOwner();
        TendaEscrow.Permit memory p = signPermit(key, owner, AMOUNT, block.timestamp + 15 minutes);

        vm.expectRevert(TendaEscrow.NativeAssetPermit.selector);
        vm.prank(owner);
        escrow.createEscrowWithPermit(
            EscrowParams.base(
                newId(),
                0,
                address(0),
                AMOUNT,
                address(0),
                uint64(block.timestamp) + ACCEPT_WINDOW,
                DURATION,
                BOND,
                false
            ),
            p
        );
    }

    /// @dev THE dress-rehearsal gap: nothing ever asserted the approve
    ///      precondition as a product flow (every ERC-20 test pre-approved
    ///      in its harness).
    function test_createEscrow_erc20_withoutApprove_reverts() public {
        vm.prank(creator);
        vm.expectRevert(); // token-level: insufficient allowance
        escrow.createEscrow(
            EscrowParams.base(
                newId(),
                0,
                address(usdc),
                100e6,
                address(0),
                uint64(block.timestamp) + ACCEPT_WINDOW,
                DURATION,
                0,
                false
            )
        );
    }

    function test_disputeEscrow_erc20Bond_withoutApprove_reverts() public {
        bytes16 id = newId();
        uint256 amount = 100e6;
        uint256 bond = 10e6;
        vm.startPrank(creator);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, bond, false
            )
        );
        vm.stopPrank();
        vm.prank(worker);
        escrow.acceptEscrow(id);

        vm.prank(worker); // worker never approved the bond
        vm.expectRevert();
        escrow.disputeEscrow(id);
    }

    function test_disputeEscrowWithPermit_erc20Bond_succeeds() public {
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        uint256 amount = 100e6;
        uint256 bond = 10e6;
        vm.startPrank(creator);
        usdc.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, bond, false
            )
        );
        vm.stopPrank();
        vm.prank(owner);
        escrow.acceptEscrow(id);

        TendaEscrow.Permit memory p = signPermit(key, owner, bond, block.timestamp + 15 minutes);
        vm.prank(owner);
        escrow.disputeEscrowWithPermit(id, p);

        assertEq(uint8(status(id)), 6); // Disputed
        assertEq(usdc.balanceOf(address(escrow)), amount + bond);
    }

    function test_disputeEscrowWithPermit_nativeAsset_reverts() public {
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        createNative(id);
        vm.prank(owner);
        escrow.acceptEscrow(id);

        TendaEscrow.Permit memory p = signPermit(key, owner, BOND, block.timestamp + 15 minutes);
        vm.prank(owner);
        vm.expectRevert(TendaEscrow.NativeAssetPermit.selector);
        escrow.disputeEscrowWithPermit(id, p);
    }

    function test_disputeEscrowWithPermit_zeroBond_succeeds() public {
        // Zero-bond escrow: the permit is superfluous but harmless — the
        // bond collection short-circuits and the dispute still lands.
        (address owner, uint256 key) = newPermitOwner();
        bytes16 id = newId();
        vm.startPrank(creator);
        usdc.approve(address(escrow), 100e6);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(usdc), 100e6, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, 0, false
            )
        );
        vm.stopPrank();
        vm.prank(owner);
        escrow.acceptEscrow(id);

        TendaEscrow.Permit memory p = signPermit(key, owner, 0, block.timestamp + 15 minutes);
        vm.prank(owner);
        escrow.disputeEscrowWithPermit(id, p);
        assertEq(uint8(status(id)), 6); // Disputed
    }

    // ---------------------------------------------------------------------
    // fuzz
    // ---------------------------------------------------------------------

    function testFuzz_feeMath_neverExceedsAmount_sumsExactly(uint96 rawAmount, bool isSeeker) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000 ether);
        bytes16 id = newId();
        vm.deal(creator, amount);
        vm.prank(creator);
        escrow.createEscrow{value: amount}(
            EscrowParams.base(
                id, 0, address(0), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, 0, isSeeker
            )
        );
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, PROOF);

        uint256 workerBefore = worker.balance;
        uint256 treasuryBefore = treasury.balance;
        vm.prank(creator);
        escrow.approveCompletion(id);

        uint256 bps = isSeeker ? SEEKER_FEE_BPS : FEE_BPS;
        uint256 expectedFee = (amount * bps) / 10_000;
        assertEq(treasury.balance - treasuryBefore, expectedFee);
        assertEq(worker.balance - workerBefore, amount - expectedFee);
        // Conservation: vault fully drained, nothing stuck.
        assertEq(address(escrow).balance, 0);
    }
}
