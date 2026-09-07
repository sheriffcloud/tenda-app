/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/tenda_escrow.json`.
 */
export type TendaEscrow = {
  "address": "cU6Z67oRepxKfiaCUKTqHiXMWVifFdYpVG1QC4SR6Eb",
  "metadata": {
    "name": "tendaEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Tenda Escrow Smart Contract"
  },
  "instructions": [
    {
      "name": "acceptEscrow",
      "discriminator": [
        193,
        2,
        224,
        245,
        36,
        116,
        65,
        154
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "approveCompletionSol",
      "discriminator": [
        192,
        4,
        178,
        86,
        79,
        181,
        106,
        28
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty",
          "docs": [
            "`escrow.counterparty` (cannot use `has_one` because the field is an",
            "Option). Handlers that don't pay counterparty (e.g. reclaim) must",
            "still pass the correct account to satisfy this struct; in those cases",
            "we just don't transfer anything to it."
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "approveCompletionSpl",
      "discriminator": [
        236,
        17,
        111,
        161,
        202,
        142,
        54,
        175
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty"
        },
        {
          "name": "treasury",
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "counterpartyTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "assignAccept",
      "docs": [
        "Approval mode: creator assigns a worker AND moves the escrow to",
        "Accepted in one instruction (the worker signs nothing to start)."
      ],
      "discriminator": [
        114,
        240,
        144,
        27,
        147,
        65,
        189,
        31
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "worker",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "cancelEscrowSol",
      "discriminator": [
        124,
        184,
        202,
        166,
        255,
        222,
        202,
        177
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancelEscrowSpl",
      "discriminator": [
        245,
        93,
        217,
        242,
        48,
        113,
        173,
        145
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimStalledPaymentSol",
      "discriminator": [
        212,
        137,
        8,
        120,
        49,
        57,
        157,
        224
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty",
          "docs": [
            "`escrow.counterparty` (cannot use `has_one` because the field is an",
            "Option). Handlers that don't pay counterparty (e.g. reclaim) must",
            "still pass the correct account to satisfy this struct; in those cases",
            "we just don't transfer anything to it."
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimStalledPaymentSpl",
      "discriminator": [
        85,
        157,
        137,
        90,
        30,
        87,
        83,
        38
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty"
        },
        {
          "name": "treasury",
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "counterpartyTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeLegacyPlatform",
      "docs": [
        "Devnet migration: close a stale pre-rewrite platform PDA so",
        "`initialize_platform` can re-create it. Permanent no-op against a",
        "current-layout platform (see instruction docs)."
      ],
      "discriminator": [
        109,
        238,
        145,
        143,
        180,
        162,
        231,
        232
      ],
      "accounts": [
        {
          "name": "platformRaw",
          "docs": [
            "`PlatformState`; the handler enforces ownership and the size guard."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createEscrowSol",
      "discriminator": [
        92,
        113,
        86,
        137,
        12,
        174,
        217,
        134
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "args.escrow_id"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "System-owned PDA holding escrowed lamports + dispute bond. Created as",
            "a zero-data system account so its lamport balance is the escrow value."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "args.escrow_id"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createEscrowArgs"
            }
          }
        }
      ]
    },
    {
      "name": "createEscrowSpl",
      "discriminator": [
        156,
        161,
        63,
        58,
        59,
        1,
        42,
        175
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "args.escrow_id"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "Per-escrow token vault. PDA-owned token account whose `authority` is",
            "the Escrow data PDA — settlement instructions sign as that PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "args.escrow_id"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createEscrowArgs"
            }
          }
        }
      ]
    },
    {
      "name": "declineAssignedEscrow",
      "discriminator": [
        32,
        114,
        79,
        221,
        99,
        228,
        139,
        25
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "disputeEscrowSol",
      "discriminator": [
        187,
        38,
        190,
        58,
        27,
        179,
        75,
        44
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "raiser",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bondAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "disputeEscrowSpl",
      "discriminator": [
        62,
        198,
        212,
        133,
        4,
        8,
        199,
        97
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "raiserTokenAccount",
          "writable": true
        },
        {
          "name": "raiser",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "bondAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializePlatform",
      "discriminator": [
        119,
        201,
        101,
        45,
        75,
        122,
        89,
        3
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializePlatformArgs"
            }
          }
        }
      ]
    },
    {
      "name": "reclaimAbandonedSol",
      "discriminator": [
        210,
        136,
        34,
        193,
        231,
        74,
        237,
        66
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty",
          "docs": [
            "`escrow.counterparty` (cannot use `has_one` because the field is an",
            "Option). Handlers that don't pay counterparty (e.g. reclaim) must",
            "still pass the correct account to satisfy this struct; in those cases",
            "we just don't transfer anything to it."
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "reclaimAbandonedSpl",
      "discriminator": [
        157,
        168,
        24,
        67,
        244,
        92,
        34,
        159
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "refundExpiredSol",
      "discriminator": [
        68,
        234,
        109,
        246,
        75,
        192,
        27,
        215
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refundExpiredSpl",
      "discriminator": [
        249,
        142,
        182,
        227,
        217,
        19,
        44,
        163
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "resolveDisputeSol",
      "discriminator": [
        17,
        252,
        31,
        28,
        181,
        13,
        132,
        85
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "disputeAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "winner",
          "type": {
            "defined": {
              "name": "disputeWinner"
            }
          }
        },
        {
          "name": "raiser",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resolveDisputeSpl",
      "discriminator": [
        192,
        38,
        201,
        202,
        164,
        196,
        37,
        96
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "creator",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "counterparty"
        },
        {
          "name": "treasury",
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "counterpartyTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "disputeAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "winner",
          "type": {
            "defined": {
              "name": "disputeWinner"
            }
          }
        },
        {
          "name": "raiser",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setApprovalWindow",
      "discriminator": [
        83,
        96,
        72,
        177,
        64,
        17,
        110,
        173
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "seconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setDisputeAdmin",
      "discriminator": [
        34,
        74,
        134,
        213,
        180,
        58,
        145,
        209
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setFeeBps",
      "discriminator": [
        2,
        161,
        245,
        141,
        111,
        32,
        39,
        198
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "seekerFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setGracePeriod",
      "discriminator": [
        204,
        152,
        174,
        131,
        164,
        249,
        113,
        224
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "seconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setProtocolAdmin",
      "discriminator": [
        48,
        249,
        109,
        189,
        157,
        197,
        31,
        183
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setTreasury",
      "discriminator": [
        57,
        97,
        196,
        95,
        195,
        206,
        106,
        136
      ],
      "accounts": [
        {
          "name": "platformState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "protocolAdmin",
          "signer": true,
          "relations": [
            "platformState"
          ]
        }
      ],
      "args": [
        {
          "name": "newTreasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "submitProof",
      "discriminator": [
        54,
        241,
        46,
        84,
        4,
        212,
        46,
        94
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "proofHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "unassign",
      "docs": [
        "Approval mode: creator withdraws an assignment inside the unassign",
        "window, returning the escrow to Open with funds untouched."
      ],
      "discriminator": [
        68,
        109,
        101,
        120,
        18,
        20,
        57,
        58
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "platformState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    },
    {
      "name": "platformState",
      "discriminator": [
        160,
        10,
        182,
        134,
        98,
        122,
        78,
        239
      ]
    }
  ],
  "events": [
    {
      "name": "assignmentReleased",
      "discriminator": [
        102,
        122,
        112,
        10,
        150,
        89,
        255,
        214
      ]
    },
    {
      "name": "counterpartyAssigned",
      "discriminator": [
        154,
        197,
        2,
        193,
        49,
        54,
        77,
        247
      ]
    },
    {
      "name": "disputeRaised",
      "discriminator": [
        246,
        167,
        109,
        37,
        142,
        45,
        38,
        176
      ]
    },
    {
      "name": "disputeResolved",
      "discriminator": [
        121,
        64,
        249,
        153,
        139,
        128,
        236,
        187
      ]
    },
    {
      "name": "escrowAbandoned",
      "discriminator": [
        189,
        88,
        100,
        222,
        42,
        86,
        171,
        42
      ]
    },
    {
      "name": "escrowAccepted",
      "discriminator": [
        129,
        122,
        76,
        235,
        127,
        11,
        32,
        165
      ]
    },
    {
      "name": "escrowApproved",
      "discriminator": [
        87,
        181,
        230,
        68,
        208,
        43,
        121,
        31
      ]
    },
    {
      "name": "escrowCancelled",
      "discriminator": [
        98,
        241,
        195,
        122,
        213,
        0,
        162,
        161
      ]
    },
    {
      "name": "escrowCreated",
      "discriminator": [
        70,
        127,
        105,
        102,
        92,
        97,
        7,
        173
      ]
    },
    {
      "name": "escrowDeclined",
      "discriminator": [
        5,
        132,
        93,
        142,
        193,
        165,
        170,
        67
      ]
    },
    {
      "name": "escrowExpired",
      "discriminator": [
        189,
        22,
        170,
        250,
        75,
        218,
        58,
        112
      ]
    },
    {
      "name": "paymentClaimed",
      "discriminator": [
        238,
        86,
        136,
        254,
        229,
        217,
        63,
        80
      ]
    },
    {
      "name": "platformConfigChanged",
      "discriminator": [
        77,
        52,
        192,
        53,
        141,
        149,
        24,
        112
      ]
    },
    {
      "name": "platformInitialized",
      "discriminator": [
        16,
        222,
        212,
        5,
        213,
        140,
        112,
        162
      ]
    },
    {
      "name": "proofSubmitted",
      "discriminator": [
        160,
        51,
        85,
        70,
        249,
        89,
        5,
        139
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "platformFeeTooHigh",
      "msg": "platform fee bps exceeds MAX_PLATFORM_FEE_BPS"
    },
    {
      "code": 6001,
      "name": "seekerFeeExceedsStandardFee",
      "msg": "seeker_fee_bps must not exceed fee_bps"
    },
    {
      "code": 6002,
      "name": "approvalWindowOutOfRange",
      "msg": "approval_window_seconds out of allowed range"
    },
    {
      "code": 6003,
      "name": "gracePeriodOutOfRange",
      "msg": "grace_period_seconds out of allowed range"
    },
    {
      "code": 6004,
      "name": "notProtocolAdmin",
      "msg": "caller is not the protocol admin"
    },
    {
      "code": 6005,
      "name": "notDisputeAdmin",
      "msg": "caller is not the dispute admin"
    },
    {
      "code": 6006,
      "name": "amountTooLow",
      "msg": "amount below MIN_ESCROW_AMOUNT"
    },
    {
      "code": 6007,
      "name": "completionDurationOutOfRange",
      "msg": "completion_duration_seconds out of allowed range"
    },
    {
      "code": 6008,
      "name": "acceptDeadlineInPast",
      "msg": "accept_deadline must be in the future"
    },
    {
      "code": 6009,
      "name": "invalidAssetForInstruction",
      "msg": "invalid asset for this instruction (SOL escrow expects system_program; SPL expects mint)"
    },
    {
      "code": 6010,
      "name": "mintMismatch",
      "msg": "supplied mint does not match escrow.asset"
    },
    {
      "code": 6011,
      "name": "vaultMismatch",
      "msg": "supplied vault PDA does not match escrow"
    },
    {
      "code": 6012,
      "name": "tokenAccountMismatch",
      "msg": "supplied token account does not match escrow"
    },
    {
      "code": 6013,
      "name": "treasuryMismatch",
      "msg": "supplied treasury account does not match platform state"
    },
    {
      "code": 6014,
      "name": "invalidEscrowStatus",
      "msg": "escrow status disallows this operation"
    },
    {
      "code": 6015,
      "name": "notCreator",
      "msg": "caller is not the escrow creator"
    },
    {
      "code": 6016,
      "name": "notCounterparty",
      "msg": "caller is not the escrow counterparty"
    },
    {
      "code": 6017,
      "name": "creatorCannotAccept",
      "msg": "creator cannot accept their own escrow"
    },
    {
      "code": 6018,
      "name": "notAssignedCounterparty",
      "msg": "escrow has an assigned counterparty; only that wallet may accept"
    },
    {
      "code": 6019,
      "name": "noAssignedCounterparty",
      "msg": "declineAssignedEscrow requires assigned_counterparty != null"
    },
    {
      "code": 6020,
      "name": "acceptDeadlinePassed",
      "msg": "accept_deadline has passed"
    },
    {
      "code": 6021,
      "name": "acceptDeadlineNotPassed",
      "msg": "accept_deadline has not yet passed (refundExpired requires expiry)"
    },
    {
      "code": 6022,
      "name": "submissionWindowClosed",
      "msg": "submission window has closed (completion_deadline + grace_period_seconds elapsed)"
    },
    {
      "code": 6023,
      "name": "approvalDeadlineNotPassed",
      "msg": "approval_deadline has not yet passed; counterparty cannot claim stalled"
    },
    {
      "code": 6024,
      "name": "reclaimWindowNotOpen",
      "msg": "reclaim requires completion_deadline + grace_period_seconds to have elapsed"
    },
    {
      "code": 6025,
      "name": "notDisputeParty",
      "msg": "caller is not creator or counterparty (dispute only by parties)"
    },
    {
      "code": 6026,
      "name": "noCounterpartyForDispute",
      "msg": "escrow has no counterparty yet (cannot dispute Open status)"
    },
    {
      "code": 6027,
      "name": "disputeBondMismatch",
      "msg": "supplied dispute bond does not match escrow.dispute_bond"
    },
    {
      "code": 6028,
      "name": "arithmeticOverflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6029,
      "name": "arithmeticUnderflow",
      "msg": "arithmetic underflow"
    },
    {
      "code": 6030,
      "name": "vaultUnderfunded",
      "msg": "escrow vault balance is below the amount being settled"
    },
    {
      "code": 6031,
      "name": "amountBelowVaultRentMinimum",
      "msg": "SOL escrow amount below the vault rent-exempt minimum"
    },
    {
      "code": 6032,
      "name": "platformLayoutCurrent",
      "msg": "platform account already uses the current layout — nothing legacy to close"
    },
    {
      "code": 6033,
      "name": "approvalRequired",
      "msg": "escrow requires creator approval; the worker cannot accept directly"
    },
    {
      "code": 6034,
      "name": "notApprovalMode",
      "msg": "escrow is not in approval mode; assignAccept/unassign do not apply"
    },
    {
      "code": 6035,
      "name": "cannotAssignCreator",
      "msg": "creator cannot assign the escrow to themselves"
    },
    {
      "code": 6036,
      "name": "zeroCounterparty",
      "msg": "assigned counterparty must not be the default (all-zero) pubkey"
    },
    {
      "code": 6037,
      "name": "unassignWindowClosed",
      "msg": "unassign window has closed (accepted_at + unassign_window_seconds elapsed)"
    },
    {
      "code": 6038,
      "name": "unassignWindowOutOfRange",
      "msg": "unassign_window_seconds out of allowed range"
    },
    {
      "code": 6039,
      "name": "approvalModeCannotPreassign",
      "msg": "approval mode cannot also pre-assign a counterparty; the modes are exclusive"
    }
  ],
  "types": [
    {
      "name": "assignmentReleased",
      "docs": [
        "The creator withdrew an assignment inside the unassign window; the escrow",
        "returns to Open with its funds untouched."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "releasedBy",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "counterpartyAssigned",
      "docs": [
        "Approval-mode counterpart of `EscrowAccepted`: the creator, not the worker,",
        "moved the escrow to Accepted. Kept a DISTINCT event (rather than reusing",
        "`EscrowAccepted`) because the actor differs — a wallet history must not",
        "label the poster's transaction \"Gig accepted\"."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "assignedBy",
            "type": "pubkey"
          },
          {
            "name": "completionDeadline",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "createEscrowArgs",
      "docs": [
        "Args shared by `create_escrow_sol` and `create_escrow_spl`. Both paths",
        "validate identically; the only difference is which account-set the runtime",
        "produces (lamport vault vs. SPL token account).",
        "",
        "`accept_deadline` is absolute Unix seconds (matches what the server already",
        "produces — no client-side relative-time computation). `completion_duration`",
        "is relative because completion_deadline is computed at accept-time, not",
        "create-time."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "escrowKind"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "assignedCounterparty",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "acceptDeadline",
            "type": "i64"
          },
          {
            "name": "completionDurationSeconds",
            "type": "i64"
          },
          {
            "name": "disputeBond",
            "type": "u64"
          },
          {
            "name": "isSeeker",
            "type": "bool"
          },
          {
            "name": "requiresApproval",
            "docs": [
              "Acceptance mode. See `Escrow::requires_approval`."
            ],
            "type": "bool"
          },
          {
            "name": "unassignWindowSeconds",
            "docs": [
              "See `Escrow::unassign_window_seconds`."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disputeRaised",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "raisedBy",
            "type": "pubkey"
          },
          {
            "name": "fromStatus",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "bondAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disputeResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "winner",
            "type": {
              "defined": {
                "name": "disputeWinner"
              }
            }
          },
          {
            "name": "creatorPayout",
            "type": "u64"
          },
          {
            "name": "counterpartyPayout",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "bondRefundTo",
            "docs": [
              "`bond_refund_to` is `Some(creator)` or `Some(counterparty)` when the",
              "bond is returned to its raiser, `None` when forfeited to the other",
              "party (see dispute economics note in `dispute/resolve.rs`)."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bondAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disputeWinner",
      "docs": [
        "Winner selection for `resolve_dispute`. Wire encoding `u8` so the on-chain",
        "payload survives IDL rebuilds without reordering surprises."
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "creator"
          },
          {
            "name": "counterparty"
          },
          {
            "name": "split"
          }
        ]
      }
    },
    {
      "name": "escrow",
      "docs": [
        "Single chain-agnostic escrow primitive. Mirrors the future Solidity surface",
        "1:1 (see `stage-0-foundation.md` § Solana contract rewrite).",
        "",
        "`escrow_id` is a 16-byte UUID supplied by the server. It is the second seed",
        "of the data PDA, the SOL vault PDA, and the SPL vault PDA — so an",
        "`escrow_id` collision is detected at account creation (the PDA already",
        "exists; the `init` constraint fails).",
        "",
        "`counterparty` is `None` at creation, set by `accept_escrow`.",
        "`assigned_counterparty`:",
        "- `None` ⇒ public escrow, anyone (except creator) may accept.",
        "- `Some(pk)` ⇒ direct-assigned; only `pk` may accept.",
        "The assigned worker may release the assignment via",
        "`decline_assigned_escrow`, which clears `assigned_counterparty` to `None`",
        "and leaves status = Open."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "escrowKind"
              }
            }
          },
          {
            "name": "asset",
            "docs": [
              "SPL mint pubkey for token escrows; `system_program::ID` for native SOL."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "assignedCounterparty",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "acceptDeadline",
            "type": "i64"
          },
          {
            "name": "completionDurationSeconds",
            "docs": [
              "Stored at create-time so `accept_escrow` can compute",
              "`completion_deadline = now + completion_duration_seconds` without",
              "requiring the caller to supply it again."
            ],
            "type": "i64"
          },
          {
            "name": "completionDeadline",
            "docs": [
              "0 at create; set by `accept_escrow` to `now + completion_duration_seconds`."
            ],
            "type": "i64"
          },
          {
            "name": "approvalDeadline",
            "docs": [
              "0 at create; set by `submit_proof` to",
              "`now + platform_state.approval_window_seconds`."
            ],
            "type": "i64"
          },
          {
            "name": "disputeBond",
            "type": "u64"
          },
          {
            "name": "isSeeker",
            "type": "bool"
          },
          {
            "name": "requiresApproval",
            "docs": [
              "Acceptance mode, fixed at create.",
              "`false` ⇒ the worker moves the escrow to Accepted themselves via",
              "`accept_escrow` (open first-come, or restricted to",
              "`assigned_counterparty` when that is set).",
              "`true`  ⇒ `accept_escrow` is closed; only the creator can move it,",
              "via `assign_accept`.",
              "",
              "The two guards make the mode an EXACT witness of provenance:",
              "`status == Accepted && requires_approval` holds if and only if the",
              "creator assigned the worker, i.e. the worker never signed. `unassign`",
              "relies on that equivalence, so a worker who accepted of their own",
              "accord can never be unassigned."
            ],
            "type": "bool"
          },
          {
            "name": "unassignWindowSeconds",
            "docs": [
              "How long after `assign_accept` the creator may still `unassign`.",
              "Per-escrow (a term of THIS deal, fixed when it is posted) rather than",
              "a mutable platform-wide value, so changing the default never",
              "retroactively re-opens a settled assignment — and, unlike a",
              "`PlatformState` field, it does not resize the singleton platform PDA.",
              "Server-supplied from `platform_config`, bounded on-chain by",
              "`MIN`/`MAX_UNASSIGN_WINDOW_SECONDS` exactly like",
              "`completion_duration_seconds`. Only meaningful when",
              "`requires_approval` is true."
            ],
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for the Escrow data PDA. Stored so settlement instructions can",
              "`signer = [ESCROW_SEED, escrow_id.as_ref(), &[bump]]` without re-deriving."
            ],
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "docs": [
              "Bump for the per-escrow SOL vault PDA. 0 if `kind != Sol`."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrowAbandoned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "refundAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "completionDeadline",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "refundAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "escrowKind"
              }
            }
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "assignedCounterparty",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "acceptDeadline",
            "type": "i64"
          },
          {
            "name": "completionDurationSeconds",
            "type": "i64"
          },
          {
            "name": "disputeBond",
            "type": "u64"
          },
          {
            "name": "isSeeker",
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowDeclined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "declinedBy",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowExpired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "refundAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowKind",
      "docs": [
        "Escrow asset class. Wider type than a bool because Stage 3+ will add EVM",
        "variants and a discriminant gives the IDL a stable shape across chains."
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "gig"
          },
          {
            "name": "exchange"
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "docs": [
        "On-chain status. Discriminants are explicit so server-side decoders are",
        "not broken by reordering. The DB-only `Draft` status (foundation.md L548)",
        "never appears here."
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "accepted"
          },
          {
            "name": "submitted"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "refunded"
          },
          {
            "name": "disputed"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "initializePlatformArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "protocolAdmin",
            "type": "pubkey"
          },
          {
            "name": "disputeAdmin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "seekerFeeBps",
            "type": "u16"
          },
          {
            "name": "approvalWindowSeconds",
            "type": "i64"
          },
          {
            "name": "gracePeriodSeconds",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "paymentClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "platformConfigChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "parameter",
            "docs": [
              "Identifier of the parameter that changed:",
              "`\"fee_bps\"`, `\"seeker_fee_bps\"`, `\"approval_window_seconds\"`,",
              "`\"grace_period_seconds\"`, `\"dispute_admin\"`, `\"protocol_admin\"`,",
              "`\"treasury\"`. Listener routes on this value."
            ],
            "type": "string"
          },
          {
            "name": "oldValue",
            "docs": [
              "Old value rendered as base-10 (numbers) or base-58 (pubkeys) so a",
              "single `String` works across heterogeneous parameter types."
            ],
            "type": "string"
          },
          {
            "name": "newValue",
            "type": "string"
          },
          {
            "name": "changedBy",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "platformInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "protocolAdmin",
            "type": "pubkey"
          },
          {
            "name": "disputeAdmin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "seekerFeeBps",
            "type": "u16"
          },
          {
            "name": "approvalWindowSeconds",
            "type": "i64"
          },
          {
            "name": "gracePeriodSeconds",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "platformState",
      "docs": [
        "Singleton platform-config PDA. Seeds = [PLATFORM_SEED].",
        "",
        "`protocol_admin` and `dispute_admin` are deliberately separate (foundation",
        "L522, L587): routine dispute resolution runs through a single ops-held key",
        "(rotatable to 2-of-3 in Stage 5) while parameter changes require the",
        "3-of-5 Squads multisig.",
        "",
        "`grace_period_seconds` and `approval_window_seconds` are mutable via",
        "admin-only instructions so we can tune without a contract redeploy."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "protocolAdmin",
            "type": "pubkey"
          },
          {
            "name": "disputeAdmin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "seekerFeeBps",
            "type": "u16"
          },
          {
            "name": "approvalWindowSeconds",
            "type": "i64"
          },
          {
            "name": "gracePeriodSeconds",
            "type": "i64"
          },
          {
            "name": "totalVolume",
            "docs": [
              "Saturating-add — analytics only, never gates logic."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proofSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "approvalDeadline",
            "type": "i64"
          },
          {
            "name": "proofHash",
            "docs": [
              "32-byte hash of the proof bundle (URI + metadata). Server stores the",
              "pre-image in `gig_proofs`; on-chain only carries the commitment."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "escrowSeed",
      "docs": [
        "Escrow data PDA: seeds = [ESCROW_SEED, escrow_id]."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119]"
    },
    {
      "name": "escrowTokenSeed",
      "docs": [
        "Per-escrow SPL token ATA-equivalent PDA: seeds = [ESCROW_TOKEN_SEED, escrow_id].",
        "Holds SPL token balance for token escrows. Owned by Token Program; the",
        "authority is the Escrow data PDA so settlement instructions sign as that PDA."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119, 95, 116, 111, 107, 101, 110]"
    },
    {
      "name": "escrowVaultSeed",
      "docs": [
        "Per-escrow SOL vault PDA (system-owned): seeds = [ESCROW_VAULT_SEED, escrow_id].",
        "Holds lamports for native-SOL escrows. Separate from the data PDA so",
        "rent-exempt lamports never mingle with the escrowed amount + bond — a",
        "standard footgun the two-vault layout eliminates."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "platformSeed",
      "docs": [
        "PlatformState PDA: seeds = [PLATFORM_SEED]."
      ],
      "type": "bytes",
      "value": "[112, 108, 97, 116, 102, 111, 114, 109]"
    }
  ]
};
