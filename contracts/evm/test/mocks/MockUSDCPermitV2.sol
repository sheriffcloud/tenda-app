// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

/// @dev USDC-shaped EIP-2612 + EIP-3009 mock for the server's anvil lifecycle
///      suite: name "USDC", 6 decimals, and — unlike OZ's ERC20Permit (version
///      "1") — a VERSION "2" domain, matching Circle's FiatTokenV2 and therefore
///      the version the shared manifest declares for USDC. Keeps the server's
///      live domain check honest end-to-end in tests.
///
///      The EIP-3009 half mirrors FiatTokenV2's rules exactly where they are
///      load-bearing for TendaEscrow.createEscrowFor: `to` must be the caller,
///      the validity window is exclusive at both ends, a nonce is single-use
///      per authorizer, and `cancelAuthorization` retires an unused nonce.
contract MockUSDCPermitV2 is ERC20, EIP712 {
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    mapping(address => uint256) private _nonces;
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    constructor() ERC20("USDC", "USDC") EIP712("USDC", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function nonces(address owner) external view returns (uint256) {
        return _nonces[owner];
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        require(block.timestamp <= deadline, "permit expired");
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, _nonces[owner]++, deadline));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        require(signer == owner, "invalid permit signature");
        _approve(owner, spender, value);
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /// @dev FiatTokenV2.receiveWithAuthorization, v/r/s form.
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
    ) external {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!_authorizationStates[from][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        require(ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) == from, "FiatTokenV2: invalid signature");
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// @dev FiatTokenV2.cancelAuthorization: the authorizer retires a nonce it
    ///      no longer wants honoured (a draft abandoned before relay).
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(!_authorizationStates[authorizer][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        require(ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) == authorizer, "FiatTokenV2: invalid signature");
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }
}
