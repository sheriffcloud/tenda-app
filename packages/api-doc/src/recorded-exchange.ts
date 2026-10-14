/**
 * GENERATED — do not edit. One real x402 exchange, captured through the real
 * route against a real node by
 * test/integration/agent-x402-recording.anvil.test.ts, and published inline in
 * the Agent API document by ./examples.
 *
 * Re-record with `pnpm record:x402` after a DELIBERATE wire change. Editing
 * this file by hand defeats the only property it has: that a reader is looking
 * at something the server actually sent.
 *
 * Captured 2026-10-05.
 */
import type { RecordedExchange } from './examples'

export const RECORDED_EXCHANGE: RecordedExchange = {
  "polled": {
    "escrow_id": "1a30970b-cad0-4294-8960-e540f4e40bd5",
    "public_feed_revision": "0",
    "chain_id": "eip155:16602",
    "asset": "USDC_0G",
    "amount_raw": "25000000",
    "is_seeker": false,
    "status": "draft",
    "hidden": false,
    "accept_deadline": "2026-10-06T01:32:37.372Z",
    "created_at": "2026-10-05T01:32:37.391Z",
    "title": "Photograph the storefront at 12 Broad St",
    "description": null,
    "category": "service",
    "country": "NG",
    "city": "Lagos",
    "latitude": null,
    "longitude": null,
    "remote": false,
    "cross_border": false,
    "proof_requirements": [
      "image"
    ],
    "proof_params": null,
    "creator": {
      "id": "f3cd2283-fbef-4aaf-9c79-542a282a2fd6",
      "first_name": "Dispatch Bot",
      "last_name": "",
      "avatar_url": null,
      "review_score": null,
      "is_seeker": false,
      "is_agent": true,
      "country": null
    },
    "completion_duration_seconds": 3600,
    "completion_deadline": null,
    "submitted_at": null,
    "approval_deadline": null,
    "dispute_bond_raw": "0",
    "my_signer_address": null,
    "requires_approval": false,
    "is_assigned": false,
    "assigned_counterparty_id": null,
    "unassign_window_seconds": 21600,
    "assignment_released_at": null,
    "counterparty": null,
    "proofs": [],
    "dispute": null,
    "reviews": [],
    "viewer": {
      "application": null,
      "open_application_count": 0
    }
  },
  "request": {
    "creation_operation_id": "5976e843-bd4c-45ec-b3c7-20efcce5b3fc",
    "chain_id": "eip155:16602",
    "asset": "USDC_0G",
    "amount_raw": "25000000",
    "accept_window_seconds": 86400,
    "completion_duration_seconds": 3600,
    "title": "Photograph the storefront at 12 Broad St",
    "category": "service",
    "country": "NG",
    "city": "Lagos",
    "proof_requirements": [
      "image"
    ]
  },
  "payment_required": {
    "x402Version": 1,
    "accepts": [
      {
        "scheme": "tenda-escrow-create",
        "network": "eip155:16602",
        "asset": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
        "asset_id": "USDC_0G",
        "amount_raw": "25000000",
        "pay_to": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
        "escrow_id": "1a30970b-cad0-4294-8960-e540f4e40bd5",
        "max_timeout_seconds": 600,
        "expires_at_unix": 1791164557,
        "payment": {
          "kind": "eip155-authorization",
          "creator": "0x9ca6329ca074c60e145d124a277ab7521b7ef4cb",
          "create_params": {
            "escrowId": "0x1a30970bcad042948960e540f4e40bd5",
            "kind": 0,
            "asset": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
            "amount": "25000000",
            "assignedCounterparty": "0x0000000000000000000000000000000000000000",
            "acceptDeadline": "1791250357",
            "completionDuration": "3600",
            "disputeBond": "0",
            "isSeeker": false,
            "requiresApproval": false,
            "unassignWindowSeconds": "21600"
          },
          "typed_data": {
            "types": {
              "EIP712Domain": [
                {
                  "name": "name",
                  "type": "string"
                },
                {
                  "name": "version",
                  "type": "string"
                },
                {
                  "name": "chainId",
                  "type": "uint256"
                },
                {
                  "name": "verifyingContract",
                  "type": "address"
                }
              ],
              "ReceiveWithAuthorization": [
                {
                  "name": "from",
                  "type": "address"
                },
                {
                  "name": "to",
                  "type": "address"
                },
                {
                  "name": "value",
                  "type": "uint256"
                },
                {
                  "name": "validAfter",
                  "type": "uint256"
                },
                {
                  "name": "validBefore",
                  "type": "uint256"
                },
                {
                  "name": "nonce",
                  "type": "bytes32"
                }
              ]
            },
            "primaryType": "ReceiveWithAuthorization",
            "domain": {
              "name": "USDC",
              "version": "2",
              "chainId": 16602,
              "verifyingContract": "0x5fbdb2315678afecb367f032d93f642f64180aa3"
            },
            "message": {
              "from": "0x9ca6329ca074c60e145d124a277ab7521b7ef4cb",
              "to": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
              "value": "25000000",
              "validAfter": "0",
              "validBefore": "1791164557",
              "nonce": "0xf2b2d7795de8c7336a429853bc4d5d5ad89414038e89783affdc8ae25e3c0426"
            }
          }
        }
      }
    ],
    "error": "payment required: sign the terms in `accepts` and resend with an X-PAYMENT header",
    "task_id": "1a30970b-cad0-4294-8960-e540f4e40bd5"
  },
  "payment_envelope": {
    "x402Version": 1,
    "scheme": "tenda-escrow-create",
    "network": "eip155:16602",
    "payload": {
      "signature": "0xbb3b6ee8adf02e079152ccf4695c9f3fcc17ad18a202f7da59e55ed65e153e1b5ad80876fad0ee94886491b8f702bdb8de89b90571f6ae13d5edd3c107fa0d571c",
      "authorization": {
        "from": "0x9ca6329ca074c60e145d124a277ab7521b7ef4cb",
        "to": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
        "value": "25000000",
        "validAfter": "0",
        "validBefore": "1791164557",
        "nonce": "0xf2b2d7795de8c7336a429853bc4d5d5ad89414038e89783affdc8ae25e3c0426"
      }
    }
  },
  "created": {
    "task_id": "1a30970b-cad0-4294-8960-e540f4e40bd5",
    "tx_ref": "0xb65ec1370b071248ec85ff23c1d1c8b9a1577787c2cac25af3892c04a2840010",
    "status": "draft",
    "recorded": true,
    "enqueued": false
  },
  "settlement": {
    "success": true,
    "transaction": "0xb65ec1370b071248ec85ff23c1d1c8b9a1577787c2cac25af3892c04a2840010",
    "network": "eip155:16602",
    "payer": "0x9ca6329ca074c60e145d124a277ab7521b7ef4cb"
  }
}
