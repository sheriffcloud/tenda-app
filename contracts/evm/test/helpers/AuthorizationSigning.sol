// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TendaEscrow} from "../../src/TendaEscrow.sol";
import {MockUSDCPermitV2} from "../mocks/MockUSDCPermitV2.sol";

/// @title AuthorizationSigning — one place the EIP-3009 / EIP-2612 digests
///        are built for the suites that relay creates.
/// @dev   Signs against the token's OWN domain separator and typehashes, so
///        nothing about the domain is reconstructed by hand — a suite that
///        drifted from the token would fail here, not pass against a stub.
///        Shared by the unit suites and the invariant handler so the two
///        cannot sign two different messages and call them the same thing.
abstract contract AuthorizationSigning is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function _digest(MockUSDCPermitV2 token, bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    /// @dev A ReceiveWithAuthorization for `value` from `from` to `payee`,
    ///      bound to `nonce` (TendaEscrow.authorizationNonce(id) for a relay).
    function signAuthorization(
        MockUSDCPermitV2 token,
        uint256 fromKey,
        address from,
        address payee,
        uint256 value,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) internal view returns (TendaEscrow.Authorization memory auth) {
        bytes32 structHash = keccak256(
            abi.encode(token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, payee, value, validAfter, validBefore, nonce)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fromKey, _digest(token, structHash));
        auth = TendaEscrow.Authorization({validAfter: validAfter, validBefore: validBefore, v: v, r: r, s: s});
    }

    /// @dev The signature `cancelAuthorization` demands from the authorizer.
    function signCancel(MockUSDCPermitV2 token, uint256 key, address authorizer, bytes32 nonce)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), authorizer, nonce));
        return vm.sign(key, _digest(token, structHash));
    }

    /// @dev An EIP-2612 permit from `owner` to `spender` for `value`.
    function signPermit(
        MockUSDCPermitV2 token,
        uint256 ownerKey,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline
    ) internal view returns (TendaEscrow.Permit memory p) {
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, token.nonces(owner), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, _digest(token, structHash));
        p = TendaEscrow.Permit({value: value, deadline: deadline, v: v, r: r, s: s});
    }
}
