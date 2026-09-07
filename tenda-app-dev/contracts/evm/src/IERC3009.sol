// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IERC3009 — the transfer-with-authorization surface TendaEscrow consumes
/// @notice The Circle FiatTokenV2 shape (USDC on every EVM chain Tenda runs on),
///         v/r/s form. Only `receiveWithAuthorization` is used, never
///         `transferWithAuthorization`: the receive variant requires
///         `to == msg.sender`, so an authorization lifted from the mempool
///         cannot be redeemed by anyone but the contract it names. That
///         to-must-be-caller check is the whole front-running guard.
interface IERC3009 {
    /// @dev Moves `value` from `from` to `to` (which MUST be the caller) once
    ///      `validAfter < block.timestamp < validBefore`, consuming `nonce`.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
