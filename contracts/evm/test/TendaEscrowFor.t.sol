// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TendaEscrow} from "../src/TendaEscrow.sol";
import {RelayedCreateFixture} from "./helpers/RelayedCreateFixture.sol";

/// @title createEscrowFor — the EIP-3009 relayed create: parties and binding.
/// @dev   The properties the agent-funding design rests on, each machine-
///        checked: the SIGNER is the creator and the relayer is nobody; the
///        authorization is bound to one draft on exactly its terms (id, amount
///        and every other field ride in the nonce), so a front-runner cannot
///        alter them; a lifted signature cannot be redeemed anywhere but this
///        contract. Window, cancellation and guards: TendaEscrowForWindow.t.sol.
contract TendaEscrowForTest is RelayedCreateFixture {
    // ---------------------------------------------------------------------
    // The signer is the creator; the relayer is nobody
    // ---------------------------------------------------------------------

    function test_createEscrowFor_pullsFromSigner_recordsSignerAsCreator() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        uint256 agentBefore = usdc.balanceOf(agent);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit TendaEscrow.EscrowCreated(id, agent, 0, address(usdc), AMOUNT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TendaEscrow.EscrowCreatedFor(id, agent, relayer);
        relay(id, AMOUNT, auth);

        TendaEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.creator, agent, "the SIGNER is the creator");
        assertEq(uint8(e.status), 0, "Open");
        assertEq(e.amount, AMOUNT);
        assertEq(agentBefore - usdc.balanceOf(agent), AMOUNT, "funds came from the signer");
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(relayer), 0, "the relayer paid nothing but gas");
        assertTrue(usdc.authorizationState(agent, escrow.authorizationNonce(params(id, AMOUNT))), "nonce consumed");
    }

    function test_createEscrowFor_relayerIsNotAParty_signerOperatesTheEscrow() public {
        bytes16 id = newId();
        relay(id, AMOUNT, authFor(id, AMOUNT));

        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.NotCreator.selector);
        escrow.cancelEscrow(id);

        uint256 before = usdc.balanceOf(agent);
        vm.prank(agent);
        escrow.cancelEscrow(id);
        assertEq(usdc.balanceOf(agent) - before, AMOUNT, "refund goes to the signer");
    }

    /// @dev Authorizations are built BEFORE the prank: `authFor` makes
    ///      external view calls, and a prank binds to the next external call.
    ///      The relayer's identity is asserted through the provenance event so
    ///      "relayed by X" is a checked fact, not whoever the prank landed on.
    function test_createEscrowFor_anyCallerMayRelay_evenTheSignerItself() public {
        bytes16 a = newId();
        TendaEscrow.Authorization memory authA = authFor(a, AMOUNT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TendaEscrow.EscrowCreatedFor(a, agent, outsider);
        vm.prank(outsider);
        escrow.createEscrowFor(agent, params(a, AMOUNT), authA);
        assertEq(escrow.getEscrow(a).creator, agent);

        bytes16 b = newId();
        TendaEscrow.Authorization memory authB = authFor(b, AMOUNT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TendaEscrow.EscrowCreatedFor(b, agent, agent);
        vm.prank(agent);
        escrow.createEscrowFor(agent, params(b, AMOUNT), authB);
        assertEq(escrow.getEscrow(b).creator, agent);
    }

    // ---------------------------------------------------------------------
    // Binding: one signature, one draft, exactly its terms
    // ---------------------------------------------------------------------

    function test_authorizationNonce_hashesEveryTerm() public view {
        bytes16 id = bytes16(uint128(0x1234));
        TendaEscrow.CreateParams memory p = params(id, AMOUNT);
        bytes32 base = escrow.authorizationNonce(p);
        assertEq(base, keccak256(abi.encode(p)), "the documented derivation");
        // Any single term moves the nonce — the id, the amount, and the terms
        // a front-runner would most like to change.
        p.escrowId = bytes16(uint128(0x1235));
        assertNotEq(escrow.authorizationNonce(p), base, "id");
        p = params(id, AMOUNT + 1);
        assertNotEq(escrow.authorizationNonce(p), base, "amount");
        p = params(id, AMOUNT);
        p.assignedCounterparty = outsider;
        assertNotEq(escrow.authorizationNonce(p), base, "assignedCounterparty");
        p = params(id, AMOUNT);
        p.completionDuration += 1;
        assertNotEq(escrow.authorizationNonce(p), base, "completionDuration");
        p = params(id, AMOUNT);
        p.requiresApproval = true;
        assertNotEq(escrow.authorizationNonce(p), base, "requiresApproval");
    }

    function test_createEscrowFor_signatureForOneDraft_cannotFundAnother() public {
        bytes16 signedFor = newId();
        bytes16 other = newId();
        TendaEscrow.Authorization memory auth = authFor(signedFor, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        escrow.createEscrowFor(agent, params(other, AMOUNT), auth);
        assertFalse(
            usdc.authorizationState(agent, escrow.authorizationNonce(params(signedFor, AMOUNT))), "still unused"
        );
    }

    function test_createEscrowFor_relayerCannotChangeTheAmount() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        escrow.createEscrowFor(agent, params(id, AMOUNT + 1), auth);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        escrow.createEscrowFor(agent, params(id, AMOUNT - 1), auth);
    }

    function test_createEscrowFor_relayerCannotSubstituteTheSigner() public {
        bytes16 id = newId();
        (address impostor, uint256 impostorKey) = makeAddrAndKey("impostor");
        usdc.mint(impostor, AMOUNT);
        // Signed by the impostor but presented as the agent's authorization.
        TendaEscrow.Authorization memory auth = signAuthorization(
            usdc,
            impostorKey,
            agent,
            address(escrow),
            AMOUNT,
            escrow.authorizationNonce(params(id, AMOUNT)),
            block.timestamp - 1,
            block.timestamp + 15 minutes
        );
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        escrow.createEscrowFor(agent, params(id, AMOUNT), auth);
    }

    /// @dev THE front-running case the design must hold against: the relayer's
    ///      transaction exposes the authorization; a stranger resubmits it with
    ///      the same id and amount but THEIR terms (pre-assigned to themselves,
    ///      the longest duration) to lock the signer's funds. Every term is in
    ///      the signed nonce, so the altered params fail the token's check.
    function test_createEscrowFor_frontRunnerCannotAlterTheTerms() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        TendaEscrow.CreateParams memory hostile = params(id, AMOUNT);
        hostile.assignedCounterparty = outsider;
        hostile.completionDuration = escrow.MAX_COMPLETION_DURATION_SECONDS();
        vm.prank(outsider);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        escrow.createEscrowFor(agent, hostile, auth);
        assertEq(usdc.balanceOf(agent), AGENT_FUNDS, "nothing left the signer");

        // Resubmitting the SAME terms is harmless: the escrow the signer asked
        // for exists, whoever paid the gas.
        vm.prank(outsider);
        escrow.createEscrowFor(agent, params(id, AMOUNT), auth);
        assertEq(escrow.getEscrow(id).creator, agent);
        assertEq(escrow.getEscrow(id).assignedCounterparty, address(0));
    }

    function test_createEscrowFor_replay_refusedByTheDraftId() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        relay(id, AMOUNT, auth);
        vm.prank(relayer);
        vm.expectRevert(TendaEscrow.EscrowAlreadyExists.selector);
        escrow.createEscrowFor(agent, params(id, AMOUNT), auth);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT, "pulled exactly once");
    }

    // ---------------------------------------------------------------------
    // Front-running: a lifted authorization is worthless to anyone else
    // ---------------------------------------------------------------------

    function test_liftedAuthorization_cannotBeRedeemedByAnotherPayee_relayStillLands() public {
        bytes16 id = newId();
        TendaEscrow.Authorization memory auth = authFor(id, AMOUNT);
        bytes32 nonce = escrow.authorizationNonce(params(id, AMOUNT));

        // Redeeming it at the token directly: `to` is the escrow, so only the
        // escrow may call — and re-aiming `to` at oneself breaks the signature.
        vm.prank(outsider);
        vm.expectRevert(bytes("FiatTokenV2: caller must be the payee"));
        usdc.receiveWithAuthorization(
            agent, address(escrow), AMOUNT, auth.validAfter, auth.validBefore, nonce, auth.v, auth.r, auth.s
        );
        vm.prank(outsider);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.receiveWithAuthorization(
            agent, outsider, AMOUNT, auth.validAfter, auth.validBefore, nonce, auth.v, auth.r, auth.s
        );

        relay(id, AMOUNT, auth);
        assertEq(escrow.getEscrow(id).creator, agent);
    }
}
