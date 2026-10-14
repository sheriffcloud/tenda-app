# Licensing

This repository is licensed in two parts.

| Path | Licence | What it means |
|---|---|---|
| `contracts/` | **Apache-2.0** | Open source. Fork it, deploy it, build on it, commercially or not. |
| Everything else | **BUSL-1.1** | Source-available. Read it, audit it, run it — but not as a competing service. Each version becomes Apache-2.0 two years after its release. |

## Why the split

The contracts are the part that has to be verifiable by anyone, forever. They
hold the escrowed funds, and a user's guarantee is that the settlement rules
are the ones they can read on-chain — that guarantee is worth nothing if the
source is encumbered. They are also the part other builders may want to
compose with. So they are permissive, with no strings.

The apps are the business. Opening them fully would let a competitor stand up
the same product with none of the cost of building it, and Tenda is a young
company that cannot absorb that. BUSL protects that while a lead still matters,
and stops protecting it once it does not.

## What BUSL-1.1 actually permits

Read the `LICENSE` file for the binding text. In plain terms:

**You may** read the source, audit it, modify it, redistribute it, run it for
evaluation or security research, run it inside your own organisation, and use
it to settle transactions you are a party to.

**You may not** offer it — or anything derived from it — to third parties as a
hosted or managed escrow, payments or dispute-resolution service.

**After two years**, that restriction lapses for that version and it becomes
Apache-2.0 automatically, with nothing required from us.

## The Change Date is per version, and it rolls

Each released version carries its own Change Date, two years out. A version
published in August 2026 becomes Apache-2.0 in August 2028; one published next
year becomes Apache-2.0 two years after *that*. So the newest freely-forkable
code is always about two years behind the newest code — the window never widens,
and it never closes either.

The `LICENSE` states this as *"Two years from the date the Licensed Work is
published"* rather than as a fixed calendar date, deliberately. A fixed date
would have to be bumped by hand on every release, and forgetting would fail in
the worst direction: a release shipped after that date would arrive already past
its Change Date, and therefore be Apache-2.0 the day it shipped. The relative
form cannot drift.

This is also the honest answer to "what if Tenda disappears": you are never
more than two years away from an Apache-2.0 copy of the apps, and the contracts
are Apache-2.0 the day they ship.

## Change License

Apache-2.0. BUSL-1.1 requires a Change License compatible with "GPL Version 2.0
or a later version"; Apache-2.0 is compatible with GPLv3, which satisfies that
covenant, and it matches what `contracts/` already uses so the repository
eventually settles on one licence family.

## Trademarks

Neither licence grants rights in the Tenda name, logo or marks. Apache-2.0 §6
excludes trademarks explicitly, and BUSL-1.1 does the same. See
[TRADEMARK.md](TRADEMARK.md) — in short, fork the code, but do not ship it
called Tenda.

## Third-party code

Dependencies vendored under `contracts/evm/lib/` (OpenZeppelin Contracts,
forge-std) are covered by their own licences in their own directories, and
nothing here changes them.

## Contributing

Contributions are welcome, but note that a source-available licence makes the
provenance of outside contributions matter more than it would under a permissive
one. A contributor agreement is not yet in place; until it is, please open an
issue before sending a substantial patch so we can sort the paperwork out first.
