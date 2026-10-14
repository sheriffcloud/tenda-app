/**
 * Authority pubkeys can never be the default (all-zero) key — on initialize
 * or on rotation. Parity with TendaEscrow.sol, whose constructor and
 * set{ProtocolAdmin,DisputeAdmin,Treasury} revert ZeroAddress: a zero
 * protocol_admin bricks every admin instruction, a zero dispute_admin makes
 * every dispute unresolvable, a zero treasury burns every fee.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

import { TestCtx, expectTendaError, initPlatform, newCtx } from "./helpers";

const AUTHORITIES = ["protocolAdmin", "disputeAdmin", "treasury"] as const;
type Authority = (typeof AUTHORITIES)[number];

const SETTER: Record<
  Authority,
  "setProtocolAdmin" | "setDisputeAdmin" | "setTreasury"
> = {
  protocolAdmin: "setProtocolAdmin",
  disputeAdmin: "setDisputeAdmin",
  treasury: "setTreasury",
};

describe("authority pubkeys refuse the default (zero) key", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = newCtx();
  });

  function rotate(authority: Authority, next: PublicKey) {
    return ctx.program.methods[SETTER[authority]](next)
      .accountsPartial({
        platformState: ctx.platformPda,
        protocolAdmin: ctx.protocolAdmin.publicKey,
      })
      .signers([ctx.protocolAdmin])
      .rpc();
  }

  for (const authority of AUTHORITIES) {
    it(`initialize_platform rejects a zero ${authority}`, async () => {
      await expectTendaError(
        initPlatform(ctx, { [authority]: PublicKey.default }),
        "ZeroAuthority",
      );
      assert.isNull(ctx.svm.getAccount(ctx.platformPda), "no state created");
    });

    it(`${SETTER[authority]} rejects the zero key and leaves state untouched`, async () => {
      await initPlatform(ctx);
      const before = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      await expectTendaError(
        rotate(authority, PublicKey.default),
        "ZeroAuthority",
      );
      const after = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(after[authority].equals(before[authority]));
    });

    it(`${SETTER[authority]} still accepts a real key`, async () => {
      await initPlatform(ctx);
      const next = Keypair.generate().publicKey;
      await rotate(authority, next);
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state[authority].equals(next));
    });
  }
});
