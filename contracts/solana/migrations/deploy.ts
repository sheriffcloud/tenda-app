import * as anchor from "@coral-xyz/anchor";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import { TendaEscrow } from "../target/types/tenda_escrow";

// ── Config ────────────────────────────────────────────────────────────────────
// One-time platform initialization. Creates the PlatformState PDA; all values
// are mutable afterwards via the admin instructions (set_fee_bps, set_treasury,
// …), so exact-at-init is not critical — authorities are.
//
// Run by `anchor migrate` ONLY. `anchor deploy` does not run migrations (there
// is no --migrate flag; `anchor migrate --help` is the whole contract: "Runs the
// deploy migration script"). A freshly deployed program is therefore live but
// unusable — every instruction reading platform config fails on a missing
// account — until this is run as a SEPARATE step. There is no constructor
// guarantee here as there is on EVM; this file is the convention that replaces
// it, which is why it must never be skipped or assumed.
//
// REQUIRED env on every cluster — no fallback, by design:
//   TENDA_ADMIN            protocol admin — the Squads vault on mainnet (#30)
//   TENDA_DISPUTE_ADMIN    dispute authority (ops key at launch)
//   TENDA_TREASURY         fee recipient
//
// These used to fall back to the provider wallet with a printed warning,
// "devnet only" — but nothing enforced the devnet part, so an unset TENDA_ADMIN
// on mainnet would have silently handed the protocol to whichever key ran the
// migration. It is the one value that cannot be quietly wrong: unlike EVM,
// Solana initialization is a SEPARATE transaction from the deploy, so there is
// no constructor to re-run and no revert to catch it.
//
// This mirrors contracts/evm/script/Deploy.s.sol, which reads the same three
// through `vm.envAddress` (reverts when unset) while using `vm.envOr` for the
// tunable numbers below. The authorities are required on both chains; the fees
// and windows have defaults on both.
// Optional env (defaults mirror contracts/evm/script/Deploy.s.sol and satisfy
// the on-chain ranges in programs/tenda-escrow/src/constants.rs):
//   TENDA_FEE_BPS              default 250   (2.50%)
//   TENDA_SEEKER_FEE_BPS       default 100   (1.00%, must be ≤ fee)
//   TENDA_APPROVAL_WINDOW_S    default 172800 (48h; range 1h–30d)
//   TENDA_GRACE_PERIOD_S       default 3600   (1h; range 0–14d)

const DEFAULTS = {
  feeBps: 250,
  seekerFeeBps: 100,
  approvalWindowSeconds: 172_800,
  gracePeriodSeconds: 3_600,
} as const;

/**
 * A REQUIRED authority address. Throws when unset, exactly as `vm.envAddress`
 * reverts on the EVM side — a deploy that stops is always cheaper than one that
 * assigns the protocol to the wrong key.
 */
function requiredPubkey(name: string): web3.PublicKey {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `${name} is required and was not set.\n` +
        `  Set all three authorities before running the migration:\n` +
        `    TENDA_ADMIN=<protocol admin>  TENDA_DISPUTE_ADMIN=<dispute authority>  TENDA_TREASURY=<fee recipient>\n` +
        `  They are deliberately NOT read from any .env file — initialization happens\n` +
        `  once per cluster and is not reversible from here, so it is stated at the\n` +
        `  point of use. To keep the deploy wallet as an authority on devnet, pass it\n` +
        `  explicitly: TENDA_ADMIN=$(solana address).`,
    );
  }
  try {
    return new web3.PublicKey(raw.trim());
  } catch {
    throw new Error(`${name} is not a valid base58 public key: '${raw}'`);
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got '${raw}'`);
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);

  const program = anchor.workspace.TendaEscrow as Program<TendaEscrow>;
  const payer = provider.wallet.publicKey;

  const protocolAdmin = requiredPubkey("TENDA_ADMIN");
  const disputeAdmin = requiredPubkey("TENDA_DISPUTE_ADMIN");
  const treasury = requiredPubkey("TENDA_TREASURY");
  const feeBps = envInt("TENDA_FEE_BPS", DEFAULTS.feeBps);
  const seekerFeeBps = envInt("TENDA_SEEKER_FEE_BPS", DEFAULTS.seekerFeeBps);
  const approvalWindowSeconds = envInt(
    "TENDA_APPROVAL_WINDOW_S",
    DEFAULTS.approvalWindowSeconds,
  );
  const gracePeriodSeconds = envInt(
    "TENDA_GRACE_PERIOD_S",
    DEFAULTS.gracePeriodSeconds,
  );

  // Still worth saying out loud, even now that it can only happen on purpose:
  // the deploy wallet as protocol admin or treasury is a devnet convenience,
  // not a configuration anyone should carry to mainnet.
  if (protocolAdmin.equals(payer) || treasury.equals(payer)) {
    console.warn(
      "WARN: protocol admin/treasury is the deploy wallet. Fine on devnet;\n" +
        "      on mainnet these belong to the Squads vault (#30).",
    );
  }

  // Derive the platform state PDA — seeds must match PLATFORM_SEED in constants.rs
  const [platformStatePda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    program.programId,
  );

  console.log("Program ID      :", program.programId.toBase58());
  console.log("Payer           :", payer.toBase58());
  console.log("Protocol admin  :", protocolAdmin.toBase58());
  console.log("Dispute admin   :", disputeAdmin.toBase58());
  console.log("Treasury        :", treasury.toBase58());
  console.log("Platform PDA    :", platformStatePda.toBase58());
  console.log("Fee             :", feeBps, "bps (seeker", seekerFeeBps, "bps)");
  console.log("Approval window :", approvalWindowSeconds, "s");
  console.log("Grace period    :", gracePeriodSeconds, "s");

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // initialize_platform uses `init` which will fail if the account already
  // exists. Check first so re-running the migration gives a clear message
  // rather than a cryptic Solana error.
  const existing = await provider.connection.getAccountInfo(platformStatePda);
  if (existing !== null) {
    console.log("\nPlatform already initialized — skipping.");
    console.log(
      "To change authorities/fees/windows use the set_* admin instructions.",
    );
    return;
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  // Args struct mirrors InitializePlatformArgs (instructions/admin/
  // initialize_platform.rs); i64 fields are BN in Anchor's TypeScript types.
  const tx = await program.methods
    .initializePlatform({
      protocolAdmin,
      disputeAdmin,
      treasury,
      feeBps,
      seekerFeeBps,
      approvalWindowSeconds: new BN(approvalWindowSeconds),
      gracePeriodSeconds: new BN(gracePeriodSeconds),
    })
    .accountsPartial({
      platformState: platformStatePda,
      payer,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log("\nPlatform initialized.");
  console.log("Transaction     :", tx);
};
