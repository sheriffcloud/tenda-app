// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "../mocks/MockUSDCPermitV2.sol";
import {TendaEscrowHandler} from "./TendaEscrowHandler.sol";

/// @title The invariant handler must survive the extreme seed (regression)
/// @dev `fail_on_revert = true` makes any handler panic fail an invariant, so a
///      handler that overflows on `type(uint256).max` turns the whole stateful
///      suite red — and, because Foundry persists the counterexample under
///      cache/invariant/failures, KEEPS it red on that machine until the cache
///      is deleted, with nobody having touched a contract. Seeds were incremented
///      before being reduced in two places.
///
///      Deterministic on purpose: the fuzzer only found this by luck, so these
///      do not wait for it. The creator is chosen so that the seed's own actor
///      IS the creator, which is the only way the "take the next actor" branch
///      (the one that adds to the seed) is reached.
contract TendaEscrowHandlerSeeds is Test {
    uint256 internal constant MAX = type(uint256).max;

    TendaEscrow internal escrow;
    MockUSDCPermitV2 internal token;
    TendaEscrowHandler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        escrow = new TendaEscrow(admin, makeAddr("disputeAdmin"), makeAddr("treasury"), 250, 100, 48 hours, 1 hours);
        token = new MockUSDCPermitV2();
        handler = new TendaEscrowHandler(escrow, token, admin, makeAddr("disputeAdmin"), makeAddr("treasury"));
    }

    /// @dev assignSeed 2: a plain open escrow (not a seeker's, not pre-assigned,
    ///      acceptance mode) — the shape `acceptEscrow` can reach.
    uint256 internal constant PLAIN_OPEN = 2;
    /// @dev assignSeed 3: approval mode — the shape `assignAccept` can reach.
    uint256 internal constant APPROVAL_MODE = 3;

    function _firstEscrow() internal view returns (bytes16) {
        return handler.ids(0);
    }

    /// @dev The actor one place after `seed`'s, round the ring the handler holds.
    function _nextActor(uint256 seed) internal view returns (address) {
        uint256 n = handler.actorList().length;
        return handler.actorList()[(seed % n + 1) % n];
    }

    function test_acceptEscrow_atMaxSeed_picksTheNextActor() public {
        // The seed picks the same actor to create and to accept, so the creator IS
        // the seed's own actor and the "take the next one" branch is reached.
        handler.createERC20(MAX, 1000, 0, 1 hours, 3 days, 0, PLAIN_OPEN);
        bytes16 id = _firstEscrow();
        address creator = escrow.getEscrow(id).creator;

        handler.acceptEscrow(0, MAX);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(TendaEscrow.Status.Accepted), "the escrow was not accepted");
        assertTrue(e.counterparty != creator, "the creator accepted their own escrow");
        assertEq(e.counterparty, _nextActor(MAX), "not the next actor in the ring");
    }

    function test_assignAccept_atMaxSeed_picksTheNextActor() public {
        handler.createERC20(MAX, 1000, 0, 1 hours, 3 days, 0, APPROVAL_MODE);
        bytes16 id = _firstEscrow();
        address creator = escrow.getEscrow(id).creator;

        handler.assignAccept(0, MAX);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(TendaEscrow.Status.Accepted), "the escrow was not assigned");
        assertTrue(e.counterparty != creator, "the creator was assigned their own escrow");
        assertEq(e.counterparty, _nextActor(MAX), "not the next actor in the ring");
    }

    function test_createForAlteredTerms_atMaxSeed_doesNotOverflow() public {
        // Already reduced-first before the fix; pinned so the shared helper
        // cannot regress it. The call may legitimately create nothing.
        handler.createForAlteredTerms(MAX, 1000, 1 hours, 3 days, MAX);
    }
}
