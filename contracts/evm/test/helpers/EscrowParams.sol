// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TendaEscrow} from "../../src/TendaEscrow.sol";

/// @title EscrowParams — CreateParams builder for the test suites.
/// @notice `createEscrow` takes a struct so the entry points declare their
///         parameter list once. Tests want the mirror of that: a builder that
///         fills the ordinary-gig defaults, so a suite states only the fields
///         it actually varies and a new create-time field does not have to be
///         written out at every call site.
/// @dev    `base` takes the parameters in struct-declaration order. The
///         acceptance-mode fields are deliberately NOT parameters — the
///         default is the instant mode every pre-existing test assumes, and
///         the mode-specific suites opt in through `approval`/`invite` below.
library EscrowParams {
    /// Ordinary open gig: anyone may accept, no approval step.
    function base(
        bytes16 id,
        uint8 kind,
        address asset,
        uint256 amount,
        address assignedCounterparty,
        uint64 acceptDeadline,
        uint64 completionDuration,
        uint256 disputeBond,
        bool isSeeker
    ) internal pure returns (TendaEscrow.CreateParams memory) {
        return TendaEscrow.CreateParams({
            escrowId: id,
            kind: kind,
            asset: asset,
            amount: amount,
            assignedCounterparty: assignedCounterparty,
            acceptDeadline: acceptDeadline,
            completionDuration: completionDuration,
            disputeBond: disputeBond,
            isSeeker: isSeeker,
            requiresApproval: false,
            unassignWindowSeconds: 0
        });
    }

    /// Approval mode: only the creator can move the escrow to Accepted, and
    /// may withdraw that assignment for `unassignWindow` seconds afterwards.
    function approval(TendaEscrow.CreateParams memory p, uint64 unassignWindow)
        internal
        pure
        returns (TendaEscrow.CreateParams memory)
    {
        p.requiresApproval = true;
        p.unassignWindowSeconds = unassignWindow;
        return p;
    }

    /// Direct invite: a named worker still accepts for themselves.
    function invite(TendaEscrow.CreateParams memory p, address worker)
        internal
        pure
        returns (TendaEscrow.CreateParams memory)
    {
        p.assignedCounterparty = worker;
        return p;
    }
}
