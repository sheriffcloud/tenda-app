// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TendaEscrow} from "../src/TendaEscrow.sol";
import {RelayedCreateFixture} from "./helpers/RelayedCreateFixture.sol";

/// @title createEscrowForWithPermit — the EIP-2612 sibling of the relayed
///        create, for stables that lack EIP-3009.
/// @dev   Same party rule (signer = creator, relayer = nobody) and the same
///        best-effort permit semantics as createEscrowWithPermit: a front-run
///        permit still lands because the allowance is already set, and a
///        garbage permit with no allowance cannot conjure funds. Because a
///        permit binds no terms, only an allow-listed relayer may spend one.
contract TendaEscrowForPermitTest is RelayedCreateFixture {
    function test_createEscrowForWithPermit_pullsFromSigner_recordsSignerAsCreator() public {
        bytes16 id = newId();
        uint256 before = usdc.balanceOf(agent);
        assertEq(usdc.allowance(agent, address(escrow)), 0, "no prior approve");

        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TendaEscrow.EscrowCreatedFor(id, agent, relayer);
        vm.prank(relayer);
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p);

        assertEq(escrow.getEscrow(id).creator, agent, "the SIGNER is the creator");
        assertEq(before - usdc.balanceOf(agent), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.allowance(agent, address(escrow)), 0, "exact permit leaves no residue");
        assertEq(usdc.balanceOf(relayer), 0, "the relayer paid nothing but gas");
    }

    function test_createEscrowForWithPermit_relayerIsNotAParty() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        vm.prank(relayer);
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.cancelEscrow(id);
        vm.prank(agent);
        escrow.cancelEscrow(id);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS);
    }

    function test_createEscrowForWithPermit_frontRunConsumedPermit_stillLands() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        vm.prank(outsider);
        usdc.permit(agent, address(escrow), p.value, p.deadline, p.v, p.r, p.s); // lifted and consumed
        vm.prank(relayer);
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p); // swallowed permit + standing allowance
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(escrow.getEscrow(id).creator, agent);
    }

    function test_createEscrowForWithPermit_garbagePermit_noAllowance_reverts() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        p.s = bytes32(uint256(p.s) ^ 1);
        vm.prank(relayer);
        vm.expectRevert(); // token-level: insufficient allowance at transferFrom
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_createEscrowForWithPermit_permitBelowAmount_reverts() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT - 1);
        vm.prank(relayer);
        vm.expectRevert();
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_createEscrowForWithPermit_relayerCannotSubstituteTheSigner() public {
        bytes16 id = newId();
        (address impostor, uint256 impostorKey) = makeAddrAndKey("impostor");
        usdc.mint(impostor, AMOUNT);
        // The impostor's own permit, presented as the agent's: owner mismatch
        // means no allowance from the agent, so the pull from the agent fails.
        TendaEscrow.Permit memory p =
            signPermit(usdc, impostorKey, impostor, address(escrow), AMOUNT, block.timestamp + 15 minutes);
        vm.prank(relayer);
        vm.expectRevert();
        escrow.createEscrowForWithPermit(agent, params(id, AMOUNT), p);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS, "nothing left the agent");
    }

    /// @dev A 2612 permit binds an allowance and nothing else, so the terms
    ///      can only be trusted from an allow-listed relayer: a stranger who
    ///      lifts the permit — or finds a standing allowance — cannot turn it
    ///      into an escrow on their own terms.
    function test_createEscrowForWithPermit_strangerIsRefused_evenWithAStandingAllowance() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        TendaEscrow.CreateParams memory hostile = params(id, AMOUNT);
        hostile.assignedCounterparty = outsider;
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotRelayer.selector);
        escrow.createEscrowForWithPermit(agent, hostile, p);

        // The residual-allowance shape: the permit was consumed elsewhere and
        // the allowance stands. Still refused.
        usdc.permit(agent, address(escrow), p.value, p.deadline, p.v, p.r, p.s);
        assertEq(usdc.allowance(agent, address(escrow)), AMOUNT);
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotRelayer.selector);
        escrow.createEscrowForWithPermit(agent, hostile, p);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS, "nothing left the signer");
    }

    function test_setRelayer_adminOnly_toggles_andEmits() public {
        address other = makeAddr("otherRelayer");
        vm.prank(outsider);
        vm.expectRevert(TendaEscrow.NotAdmin.selector);
        escrow.setRelayer(other, true);
        vm.prank(admin);
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.setRelayer(address(0), true);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit TendaEscrow.RelayerSet(other, true, admin);
        vm.prank(admin);
        escrow.setRelayer(other, true);
        assertTrue(escrow.relayers(other));

        vm.prank(admin);
        escrow.setRelayer(other, false);
        assertFalse(escrow.relayers(other));
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        vm.prank(other);
        vm.expectRevert(TendaEscrow.NotRelayer.selector);
        escrow.createEscrowForWithPermit(agent, params(newId(), AMOUNT), p);
    }

    function test_createEscrowForWithPermit_rejectedDraft_pullsNothing() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.AmountTooLow.selector);
        escrow.createEscrowForWithPermit(agent, params(id, 0), p);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS);
    }

    function test_createEscrowForWithPermit_guards() public {
        bytes16 id = newId();
        TendaEscrow.Permit memory p = permitFor(AMOUNT);

        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.ZeroAddress.selector);
        escrow.createEscrowForWithPermit(address(0), params(id, AMOUNT), p);

        TendaEscrow.CreateParams memory native = params(id, AMOUNT);
        native.asset = address(0);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.NativeAssetPermit.selector);
        escrow.createEscrowForWithPermit(agent, native, p);

        (bool ok,) = address(escrow).call{value: 1}(
            abi.encodeCall(TendaEscrow.createEscrowForWithPermit, (agent, params(id, AMOUNT), p))
        );
        assertFalse(ok, "createEscrowForWithPermit must not accept value");
    }
}
