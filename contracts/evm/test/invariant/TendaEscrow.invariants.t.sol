// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "../mocks/MockUSDCPermitV2.sol";
import {TendaEscrowHandler} from "./TendaEscrowHandler.sol";
import {TendaEscrowHandlerBase} from "./TendaEscrowHandlerBase.sol";

/// @title TendaEscrow stateful-fuzzing invariants (#123)
/// @dev The handler drives randomized valid action sequences (every entry
///      point, both permit paths, front-run permits, mid-flight fee/window
///      changes, time warps) with fail_on_revert=true. After EVERY call:
///      solvency, fee-conservation, supply-conservation, and ghost-model
///      equivalence must hold. afterInvariant then LIQUIDATES every live
///      escrow through its exit path and asserts the contract drains to
///      zero — the machine-checked "no escrow can ever be stuck" property.
contract TendaEscrowInvariants is Test {
    TendaEscrow internal escrow;
    MockUSDCPermitV2 internal token;
    TendaEscrowHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, 250, 100, 48 hours, 1 hours);
        token = new MockUSDCPermitV2();
        handler = new TendaEscrowHandler(escrow, token, admin, disputeAdmin, treasury);
        targetContract(address(handler));
    }

    /// @dev The contract holds EXACTLY the open principals + posted bonds —
    ///      never less (insolvency) and never more (value leaked in).
    function invariant_erc20Solvency() public view {
        assertEq(token.balanceOf(address(escrow)), handler.tokenLiabilities(), "ERC20 balance != open liabilities");
    }

    function invariant_nativeSolvency() public view {
        assertEq(address(escrow).balance, handler.nativeLiabilities(), "native balance != open liabilities");
    }

    /// @dev Treasury receives exactly floor(amount*bps/10_000) on the two
    ///      fee-bearing settlements (approve/claim and counterparty-wins) —
    ///      computed with the bps live at settlement — and nothing else.
    function invariant_treasuryHoldsExactlyFees() public view {
        assertEq(token.balanceOf(treasury), handler.tokenFees(), "treasury ERC20 != accrued fees");
        assertEq(treasury.balance, handler.nativeFees(), "treasury native != accrued fees");
    }

    /// @dev No action sequence mints or burns value: everything that was
    ///      funded is still held by an actor, the escrow, or the treasury.
    function invariant_valueConservation() public view {
        address[6] memory actors = handler.actorList();
        uint256 tokenSum = token.balanceOf(address(escrow)) + token.balanceOf(treasury);
        uint256 nativeSum = address(escrow).balance + treasury.balance;
        for (uint256 i = 0; i < actors.length; i++) {
            tokenSum += token.balanceOf(actors[i]);
            nativeSum += actors[i].balance;
        }
        assertEq(tokenSum, handler.totalMinted(), "ERC20 supply leaked");
        assertEq(nativeSum, handler.totalNativeFunded(), "native value leaked");
    }

    /// @dev Ghost-model equivalence: the chain's status/parties for every
    ///      escrow ever created match the handler's independent model. Any
    ///      divergence between our understanding of the state machine and
    ///      the contract's actual behaviour fails here.
    function invariant_modelEquivalence() public view {
        uint256 n = handler.idCount();
        for (uint256 i = 0; i < n; i++) {
            bytes16 id = handler.ids(i);
            TendaEscrowHandlerBase.Ghost memory g = handler.ghostOf(id);
            TendaEscrow.Escrow memory e = escrow.getEscrow(id);
            assertEq(uint8(e.status), uint8(g.status), "status diverged from model");
            assertEq(e.creator, g.creator, "creator diverged");
            assertEq(e.counterparty, g.counterparty, "counterparty diverged");
            assertEq(e.raisedBy, g.raisedBy, "raisedBy diverged");
        }
    }

    /// @dev THE no-stuck-escrow proof: after the fuzzed sequence, every
    ///      live escrow must be exitable by the party the design says can
    ///      exit it — Open by creator-cancel, Accepted by creator-reclaim
    ///      (time passes), Submitted by creator-approve, Disputed by
    ///      admin-resolve (split: the payout-heaviest path). If any exit
    ///      reverts, or a single wei stays behind, the property is broken.
    function afterInvariant() public {
        // Far enough that every reclaim window (≤180d duration + ≤14d
        // grace, both measured from a past accept) is open.
        vm.warp(block.timestamp + 195 days);

        uint256 n = handler.idCount();
        // NB read BEFORE any prank — a view call would consume the prank
        // and resolveDispute would run as this contract (NotDisputeAdmin).
        uint8 split = escrow.WINNER_SPLIT();
        for (uint256 i = 0; i < n; i++) {
            bytes16 id = handler.ids(i);
            TendaEscrowHandlerBase.Ghost memory g = handler.ghostOf(id);
            if (g.terminal) continue;
            if (g.status == TendaEscrow.Status.Open) {
                vm.prank(g.creator);
                escrow.cancelEscrow(id);
            } else if (g.status == TendaEscrow.Status.Accepted) {
                vm.prank(g.creator);
                escrow.reclaimAbandoned(id);
            } else if (g.status == TendaEscrow.Status.Submitted) {
                vm.prank(g.creator);
                escrow.approveCompletion(id);
            } else if (g.status == TendaEscrow.Status.Disputed) {
                vm.prank(disputeAdmin);
                escrow.resolveDispute(id, split);
            }
        }

        assertEq(token.balanceOf(address(escrow)), 0, "stuck ERC20 after liquidating every escrow");
        assertEq(address(escrow).balance, 0, "stuck native after liquidating every escrow");
    }
}
