/**
 * The IDL-derivation helpers themselves (tests-common/idl-layout.ts).
 *
 * These decide what the layout and account-list pins assert, and
 * `ensurePlatform` decides whether to CLOSE a live platform account from
 * `PLATFORM_STATE_LEN`. A helper that silently returned a wrong number — or
 * quietly guessed at a type it cannot size — would make every test built on it
 * agree with the bug. So the refusals are asserted, not just the happy path.
 */
import { assert } from "chai";

import {
  PLATFORM_STATE_LEN,
  idlAccountFields,
  idlAccountLen,
  idlInstructionAccounts,
} from "../tests-common/idl-layout";

describe("idl-layout derivation", () => {
  it("sizes PlatformState from its fields, discriminator included", () => {
    // 8 discriminator + 32*3 pubkeys + 2*2 u16 + 8*2 i64 + 1 u8.
    assert.equal(PLATFORM_STATE_LEN, 8 + 32 * 3 + 2 * 2 + 8 * 2 + 1);
    assert.equal(idlAccountLen("PlatformState"), PLATFORM_STATE_LEN);
  });

  it("reads fields from a DIFFERENT account too, in declaration order", () => {
    // A second struct, so the field reader is exercised beyond the one account
    // every other test uses. Escrow is the biggest one the program declares.
    const fields = idlAccountFields("Escrow");
    assert.equal(fields[0], "escrow_id");
    assert.include(fields, "vault_bump");
  });

  it("REFUSES a type it cannot size rather than guessing", () => {
    // `Escrow.kind` is a `defined` enum. A helper that fell back to 0 (or to
    // some default width) would hand every caller a plausible wrong number.
    assert.throws(() => idlAccountLen("Escrow"), /unsupported IDL type/);
  });

  it("refuses an account name the IDL does not declare", () => {
    assert.throws(() => idlAccountLen("NoSuchAccount"), /not found/);
    assert.throws(() => idlAccountFields("NoSuchAccount"), /not found/);
  });

  it("refuses a type that is not a struct — an ENUM has no sizeable fields", () => {
    // Reachable, not hypothetical: the IDL declares three enums (DisputeWinner,
    // EscrowKind, EscrowStatus). Anchor gives them `variants`, not `fields`, so
    // a helper that read `fields ?? []` would answer 8 bytes (the bare
    // discriminator) for an account that has none — a plausible wrong number.
    for (const name of ["EscrowKind", "EscrowStatus", "DisputeWinner"]) {
      assert.throws(() => idlAccountLen(name), /is not a struct/);
      assert.throws(() => idlAccountFields(name), /is not a struct/);
    }
  });

  it("refuses an instruction name the IDL does not declare", () => {
    assert.throws(
      () => idlInstructionAccounts("no_such_instruction"),
      /not found/,
    );
  });

  it("reads an instruction's accounts in declaration order", () => {
    // Order matters: Anchor resolves accounts positionally, so a set-equal
    // assertion elsewhere would pass on a reordered — and broken — list.
    const accounts = idlInstructionAccounts("create_escrow_spl");
    assert.equal(accounts[0], "escrow");
    assert.equal(accounts[accounts.length - 1], "system_program");
  });
});
