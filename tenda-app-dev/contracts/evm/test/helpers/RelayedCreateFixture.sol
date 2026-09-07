// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TendaEscrow} from "../../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "../mocks/MockUSDCPermitV2.sol";
import {EscrowParams} from "./EscrowParams.sol";
import {AuthorizationSigning} from "./AuthorizationSigning.sol";

/// @title RelayedCreateFixture — the world the relayed-create suites share.
/// @dev   One escrow, one EIP-3009/2612 USDC mock, a keyed `agent` (the
///        signer), an allow-listed `relayer`, an `outsider`, and the builders
///        for params, authorizations and permits. Three suites inherit it
///        (3009 binding, 3009 window/guards, the permit sibling) so the fixture
///        is written once and none of them drifts in what "an agent's draft"
///        means.
abstract contract RelayedCreateFixture is AuthorizationSigning {
    TendaEscrow internal escrow;
    MockUSDCPermitV2 internal usdc;

    address internal admin = makeAddr("admin");
    address internal disputeAdmin = makeAddr("disputeAdmin");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal outsider = makeAddr("outsider");
    address internal agent;
    uint256 internal agentKey;

    uint256 internal constant AMOUNT = 100e6;
    uint256 internal constant AGENT_FUNDS = 1_000_000e6;
    uint64 internal constant ACCEPT_WINDOW = 1 days;
    uint64 internal constant DURATION = 2 hours;

    uint128 private idCounter;

    function setUp() public virtual {
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, 250, 100, 48 hours, 1 hours);
        usdc = new MockUSDCPermitV2();
        (agent, agentKey) = makeAddrAndKey("agent");
        usdc.mint(agent, AGENT_FUNDS);
        vm.deal(relayer, 1 ether);
        vm.prank(admin);
        escrow.setRelayer(relayer, true);
    }

    function newId() internal returns (bytes16) {
        idCounter += 1;
        return bytes16(idCounter);
    }

    /// @dev An ordinary open USDC gig draft. Pure builder — safe after a prank.
    function params(bytes16 id, uint256 amount) internal view returns (TendaEscrow.CreateParams memory) {
        return EscrowParams.base(
            id, 0, address(usdc), amount, address(0), uint64(block.timestamp) + ACCEPT_WINDOW, DURATION, 0, false
        );
    }

    /// @dev The authorization the agent would sign for `p`: exact amount,
    ///      nonce = the hash of the whole params, a short validity window.
    ///      Makes external view calls — build it BEFORE any prank/expectRevert,
    ///      which bind to the next external call.
    function authFor(TendaEscrow.CreateParams memory p) internal view returns (TendaEscrow.Authorization memory) {
        return signAuthorization(
            usdc,
            agentKey,
            agent,
            address(escrow),
            p.amount,
            escrow.authorizationNonce(p),
            block.timestamp - 1,
            block.timestamp + 15 minutes
        );
    }

    function authFor(bytes16 id, uint256 amount) internal view returns (TendaEscrow.Authorization memory) {
        return authFor(params(id, amount));
    }

    /// @dev The agent's permit for `value` to the escrow. Same prank caveat.
    function permitFor(uint256 value) internal view returns (TendaEscrow.Permit memory) {
        return signPermit(usdc, agentKey, agent, address(escrow), value, block.timestamp + 15 minutes);
    }

    function relay(bytes16 id, uint256 amount, TendaEscrow.Authorization memory auth) internal {
        vm.prank(relayer);
        escrow.createEscrowFor(agent, params(id, amount), auth);
    }
}
