# post-gigs — seeding a gig book as an agent

Operator runbook for `pnpm --filter tenda-server post-gigs`. Everything a live
run does is **funded and irreversible**: each gig locks the agent wallet's
tokens into an escrow on a real chain. Read the [Resuming](#resuming-a-partial-run)
section before you re-run anything.

This is internal. External agents use the API and its published document; this
file is for whoever operates a seed round, and it deliberately lives beside the
script so it changes in the same commit the script does.

## What it does

Registers a wallet-born agent against a deployment, then posts each gig in a
**book** through the one-shot `POST /v1/agent/tasks` (402 terms → signed
payment header → 201). The agent's wallet funds every escrow; the server's
relayer pays the gas, so the agent needs the **token** and **no native
balance**.

## Before the first run

1. **A deployment to post against.** The base URL is signed into the auth
   message byte for byte, so pass it exactly as the server publishes it — no
   trailing slash, no `http` when it serves `https` (the script normalises the
   trailing slash for you; nothing else).
2. **A chain id** (CAIP-2, e.g. `eip155:16602`). The asset is *derived*: it is
   the chain's gig asset from the shared manifest. A chain with no gig asset
   fails immediately, by name, rather than 422-ing mid-run.
3. **The agent's private key, exported in THIS shell.** The script loads no
   dotenv on purpose, so a key sitting in `apps/server/.env` is ignored:

   ```bash
   export AGENT_KEY=0x…            # 32-byte hex, 0x-prefixed
   ```

   A missing or malformed key fails before registration, with a message about
   the key rather than a signature error. **A dry run needs no key.**
4. **Tokens in that wallet** for the whole book. The run prints the total it is
   about to fund before it posts anything — that line is the last cheap moment
   to notice a book that costs more than intended.

## Step 1 — dry run (no key, no money)

```bash
pnpm --filter tenda-server post-gigs -- \
  --api https://dev-api.tendahq.com --chain eip155:16602 --dry-run
```

Prints the chain, the asset, the whole book with each gig's fee and worker
payout projected at the deployment's **live** `fee_bps`, and posts nothing.
Every number comes from the API and the shared asset registry, never from a
typed constant, so what you see is what that deployment would do.

## Step 2 — the book sign-off flow

The built-in book ships in `gigs.ts`. To have a reviewer approve a book first:

```bash
# 1. dump the built-in book for review
pnpm --filter tenda-server post-gigs -- --write-book book.json

# 2. edit book.json, get it signed off

# 3. post THAT file instead of the built-in one
pnpm --filter tenda-server post-gigs -- \
  --api https://dev-api.tendahq.com --chain eip155:16602 --book book.json
```

`--write-book` is its own mode and takes no other argument. Either way — file
or built-in — the whole book runs through **the server's own validators**
before the agent registers, so a bad entry fails here, by index and in the
server's words, and never as a 422 one gig into a funded run.

## Step 3 — the live run

```bash
export AGENT_KEY=0x…
pnpm --filter tenda-server post-gigs -- \
  --api https://dev-api.tendahq.com --chain eip155:16602 --limit 3
```

Start small (`--limit`) on a testnet the first time. The run prints, in order:
the API, the chain and asset, the book and how many gigs it will post, the
total it will fund, the agent address, the receipt file, then one line per gig
as it lands.

### Rate limit — a slow run is the expected run

`/v1/agent/tasks` admits about **five gigs a minute** (10 requests/min per IP,
and each gig costs two: the quote and the paid post). The script waits out a
429 and retries rather than racing the limiter, because a skipped gig in the
middle of a funded run is worse than a slow one. A twenty-gig book therefore
spends most of its wall-clock waiting. That is the limiter working.

## Resuming a partial run

**Never re-run a book that partly posted.** Each invocation mints fresh
`creation_operation_id`s, so re-running the whole book funds the already-posted
gigs a second time — nothing deduplicates them.

Two ways to continue, and one of them is safer:

- `--only <token,token>` names gigs by a substring of their title. A token that
  matches nothing, or more than one gig, is an error rather than a guess. This
  survives the book being reordered.
- `--skip N` continues positionally, and is only correct while the book's order
  is unchanged. The book is interleaved by country on purpose, so a reordering
  silently changes what `--skip 10` means.

Read the receipt file (below) to see exactly what landed before you choose.

## Receipts

Every successful post appends one JSON line **before the next gig is
attempted**, so a run that dies halfway still leaves an exact record of what it
funded:

```
apps/server/receipts/post-gigs/<api-host>.jsonl
```

The path is keyed by API host so a mainnet run can never append into a preview
run's file, and the directory is **committed** — a task id that exists only on
one laptop is not a handle for cancelling a mainnet gig. `--out FILE` overrides
the path. Each line carries the time, the API, the chain, the `task_id` (THE
handle for cancelling that gig later), the funding `tx_ref`, the title, the
amount and whether the gig requires approval.

## Flags

The script's own `USAGE` string is the authority, and
`test/unit/post-gigs-args.test.ts` pins the parser's behaviour; run
`post-gigs` with no arguments to print it. What each one is for:

| Flag | Purpose |
|---|---|
| `--write-book FILE` | Dump the built-in book as JSON for review. Its own mode; takes nothing else. |
| `--api <base-url>` | The deployment. Signed into the auth message, so it must match byte for byte. |
| `--chain <caip2>` | Which chain to post on; the asset follows from the manifest. |
| `--book FILE` | Post a signed-off book instead of the built-in one. |
| `--only tok,tok` | Post exactly the gigs whose titles contain these tokens. |
| `--skip N` | Skip the first N gigs (positional — see Resuming). |
| `--limit N` | Post at most N gigs. |
| `--amount RAW` | Override every gig's amount, in base units. |
| `--name "Agent name"` | The agent's display name at registration. |
| `--out FILE` | Write receipts here instead of the host-keyed default. |
| `--dry-run` | Project the run and post nothing. Needs no key. |

**Unknown flags are refused.** An earlier parser looked flags up by name and
ignored the rest, so a `--dry-run` misspelt with an underscore — one character
off — ran live and funded the whole book. Now every token starting with `--`
must be one of the above.

## When something goes wrong

| Symptom | Cause |
|---|---|
| `AGENT_KEY is not set` | The key is in `.env`, not in the shell. This script loads no dotenv. |
| `AGENT_KEY must be a 0x-prefixed 32-byte hex private key` | An address, a truncated key, or a missing `0x`. |
| `unknown argument '--…'` | A typo. Nothing was posted — that is the point of the refusal. |
| Registration fails on the URI | `--api` does not match what the server publishes; the URI line is compared byte for byte. |
| `… has no gig asset` / `no entry in the shared asset registry` | The chain cannot carry gigs in this deployment's manifest. |
| `--skip N passes the whole book` | The resume offset is past the end, or the book got shorter. |
| `--only '…' is ambiguous` | The token matches more than one title; name it more precisely. |
| The run stops with gigs left | Check the receipt file for what landed, then continue with `--only`. |

## Related

- `src/scripts/agent-hire-e2e/` — the full hire loop, which also settles. It
  onboards a WORKER and therefore needs a phone OTP from the server's log, so
  it only works against a local server. Posting is the agent half alone, and
  agents are wallet-born, which is why this script exists separately.
- `apps/server/receipts/post-gigs/` — the receipts every previous run left,
  committed. Read them before a resume.
