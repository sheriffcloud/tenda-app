// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TendaEscrow} from "../src/TendaEscrow.sol";

/// @notice Deploy TendaEscrow to BASE (stage 3) / CELO (stage 4).
///
/// Required env:
///   TENDA_ADMIN            Safe 3-of-5 address (protocol admin)
///   TENDA_DISPUTE_ADMIN    separate dispute authority (ops key at launch)
///   TENDA_TREASURY         fee recipient
/// Optional env (defaults mirror the Solana platform config):
///   TENDA_FEE_BPS              default 250
///   TENDA_SEEKER_FEE_BPS       default 100
///   TENDA_APPROVAL_WINDOW_S    default 172800 (48h)
///   TENDA_GRACE_PERIOD_S       default 3600 (1h)
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL \
///     --broadcast --verify --private-key $DEPLOYER_KEY
contract Deploy is Script {
    function run() external returns (TendaEscrow escrow) {
        address admin = vm.envAddress("TENDA_ADMIN");
        address disputeAdmin = vm.envAddress("TENDA_DISPUTE_ADMIN");
        address treasury = vm.envAddress("TENDA_TREASURY");
        uint16 feeBps = uint16(vm.envOr("TENDA_FEE_BPS", uint256(250)));
        uint16 seekerFeeBps = uint16(vm.envOr("TENDA_SEEKER_FEE_BPS", uint256(100)));
        uint64 approvalWindow = uint64(vm.envOr("TENDA_APPROVAL_WINDOW_S", uint256(172_800)));
        uint64 gracePeriod = uint64(vm.envOr("TENDA_GRACE_PERIOD_S", uint256(3_600)));

        vm.startBroadcast();
        escrow = new TendaEscrow(admin, disputeAdmin, treasury, feeBps, seekerFeeBps, approvalWindow, gracePeriod);
        vm.stopBroadcast();

        console.log("TendaEscrow deployed:", address(escrow));
        console.log("  admin:        ", admin);
        console.log("  disputeAdmin: ", disputeAdmin);
        console.log("  treasury:     ", treasury);
    }
}
