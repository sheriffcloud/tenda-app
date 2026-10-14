// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TendaEscrow} from "../src/TendaEscrow.sol";
import {RelayedCreateFixture} from "./helpers/RelayedCreateFixture.sol";

/// @title createEscrowFor — validity window, cancellation, rejected drafts
///        and the entry-point guards.
/// @dev   The signer's two escape hatches (window, cancelAuthorization) and
///        the promise that a rejected draft leaves the authorization unused.
contract TendaEscrowForWindowTest is RelayedCreateFixture {
    // ---------------------------------------------------------------------
    // Validity window, cancellation, and rejected drafts
    // ---------------------------------------------------------------------

    function test_createEscrowFor_outsideTheWindow_reverts() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        vm.warp(auth.validBefore); // exclusive: expired at exactly validBefore
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is expired"));
        escrow.createEscrowFor(agent, params(id, AMOUNT), auth);

        bytes16 later = newId();
        TendaEscrow.Authorization memory early = signAuthorization(
            usdc,
            agentKey,
            agent,
            address(escrow),
            AMOUNT,
            escrow.authorizationNonce(params(later, AMOUNT)),
            block.timestamp, // exclusive: not valid AT validAfter
            block.timestamp + 15 minutes
        );
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is not yet valid"));
        escrow.createEscrowFor(agent, params(later, AMOUNT), early);
    }

    function test_createEscrowFor_cancelledBySigner_cannotBeRelayed() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        bytes32 nonce = escrow.authorizationNonce(params(id, AMOUNT));
        (uint8 v, bytes32 r, bytes32 s) = signCancel(usdc, agentKey, agent, nonce);
        vm.prank(outsider); // anyone may submit the signer's cancellation
        usdc.cancelAuthorization(agent, nonce, v, r, s);

        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        escrow.createEscrowFor(agent, params(id, AMOUNT), auth);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS, "nothing left the signer");
    }

    function test_createEscrowFor_rejectedDraft_leavesTheAuthorizationUnused() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, 0);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.AmountTooLow.selector);
        escrow.createEscrowFor(agent, params(id, 0), auth);
        assertFalse(
            usdc.authorizationState(agent, escrow.authorizationNonce(params(id, 0))), "validated BEFORE the pull"
        );
    }

    function test_createEscrowFor_guards() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);

        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.createEscrowFor(address(0), params(id, AMOUNT), auth);

        TendaEscrow.CreateParams memory native = params(id, AMOUNT);
        native.asset = address(0);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.NativeAssetAuthorization.selector);
        escrow.createEscrowFor(agent, native, auth);

        // Non-payable: value cannot ride a relayed create at all.
        (bool ok,) = address(escrow).call{value: 1}(
            abi.encodeCall(TendaEscrow.createEscrowFor, (agent, params(id, AMOUNT), auth))
        );
        assertFalse(ok, "createEscrowFor must not accept value");
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
