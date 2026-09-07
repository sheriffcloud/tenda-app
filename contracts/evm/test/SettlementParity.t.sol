// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "./mocks/MockUSDCPermitV2.sol";
import {EscrowParams} from "./helpers/EscrowParams.sol";

/// @title Cross-chain settlement-math parity (golden vectors)
/// @dev `contracts/settlement-vectors.json` is the single source of expected
///      fee/split outputs, consumed by THIS suite and by the Anchor
///      program's litesvm suite (tests/settlement-parity.test.ts). Both
///      contracts implement the math independently (Solidity / Rust); these
///      vectors are what makes a rounding divergence unmergeable. Every
///      vector is driven through a REAL lifecycle — never a re-derivation
///      of the formula in the test.
contract SettlementParityTest is Test {
    // NB fields alphabetical — vm.parseJson ABI-encodes keys sorted.
    struct FeeVector {
        uint256 amount;
        uint256 bps;
        uint256 expectedFee;
    }

    struct SplitVector {
        uint256 amount;
        uint256 counterpartyShare;
        uint256 creatorHalf;
    }

    TendaEscrow internal escrow;
    MockUSDCPermitV2 internal token;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal worker = makeAddr("worker");

    uint128 internal idCounter;

    function setUp() public {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, 250, 100, 48 hours, 1 hours);
        token = new MockUSDCPermitV2();
    }

    function _vectors() internal view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/../settlement-vectors.json"));
    }

    /// @dev create → accept → submit, funded with exactly `amount`.
    function _submitted(uint256 amount, uint256 bond) internal returns (bytes16 id) {
        idCounter += 1;
        id = bytes16(idCounter);
        token.mint(creator, amount + bond);
        vm.startPrank(creator);
        token.approve(address(escrow), amount);
        escrow.createEscrow(
            EscrowParams.base(
                id, 0, address(token), amount, address(0), uint64(block.timestamp) + 1 days, 7_200, bond, false
            )
        );
        vm.stopPrank();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitProof(id, keccak256("proof"));
    }

    function test_feeVectors_settlementMatchesGoldenOutputs() public {
        FeeVector[] memory fv = abi.decode(vm.parseJson(_vectors(), ".fee"), (FeeVector[]));
        assertGt(fv.length, 0, "no fee vectors loaded");
        for (uint256 i = 0; i < fv.length; i++) {
            vm.prank(admin);
            escrow.setFeeBps(uint16(fv[i].bps), uint16(fv[i].bps)); // isSeeker=false uses the first
            uint256 treasuryBefore = token.balanceOf(treasury);
            uint256 workerBefore = token.balanceOf(worker);

            bytes16 id = _submitted(fv[i].amount, 0);
            vm.prank(creator);
            escrow.approveCompletion(id);

            assertEq(token.balanceOf(treasury) - treasuryBefore, fv[i].expectedFee, "fee diverged from vector");
            assertEq(
                token.balanceOf(worker) - workerBefore,
                fv[i].amount - fv[i].expectedFee,
                "counterparty payout diverged from vector"
            );
        }
    }

    function test_splitVectors_resolutionMatchesGoldenOutputs() public {
        SplitVector[] memory sv = abi.decode(vm.parseJson(_vectors(), ".split"), (SplitVector[]));
        assertGt(sv.length, 0, "no split vectors loaded");
        for (uint256 i = 0; i < sv.length; i++) {
            uint256 creatorBefore = token.balanceOf(creator);
            uint256 workerBefore = token.balanceOf(worker);

            bytes16 id = _submitted(sv[i].amount, 0);
            vm.prank(creator);
            escrow.disputeEscrow(id); // zero bond — split math isolated
            vm.prank(disputeAdmin);
            escrow.resolveDispute(id, 2); // WINNER_SPLIT

            assertEq(token.balanceOf(creator) - creatorBefore, sv[i].creatorHalf, "creator half diverged");
            assertEq(token.balanceOf(worker) - workerBefore, sv[i].counterpartyShare, "counterparty share diverged");
        }
    }
}
