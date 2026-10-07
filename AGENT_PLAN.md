# Sift for agents: plan

**Goal:** the same engine as the Chrome extension, usable by AI agents first and people second. Agents get an MCP server and a skill; people get a CLI with batch CSV. It stays bring-your-own-keys (Apollo or treg, plus Jev) with no Sift server.

**Status:** plan, agreed 2026-10-07. Nothing built yet.

```
npx <pkg> mcp              ← agents: an MCP server with typed tools (the priority)
npx <pkg> acme.com         ← people: one company in the terminal
npx <pkg> --from a.csv     ← people: a ranked CSV of a whole list
SKILL.md                   ← the playbook that teaches agents the workflows
```

## Why this shape

- **MCP is the front door for agents.** It works in Claude Desktop, Claude Code, Cursor, ChatGPT and most agent frameworks, and agents see typed tools with exact inputs and outputs instead of parsing terminal text.
- **The skill is the playbook, not the engine.** A `SKILL.md` teaches workflows ("qualify a list, then draft openers for strong fits only") and calls the MCP tools, or the CLI where MCP isn't available.
- **The CLI serves people,** and batch CSV is something the extension can't do.
- **One engine everywhere.** The extension, MCP server and CLI share one core, so a score means the same thing in each.

## Agent tools

| Tool | Returns | Cost |
|---|---|---|
| `sift_company(domain, icp?)` | fit score with every check, why-now signals with sources, best persona | 2 Apollo credits / ~$0.05 via treg; free if cached (7 days) |
| `find_people(domain, icp?)` | ranked contacts: name, title, rank, `person_id` (no emails) | free |
| `reveal_email(person_id, max_spend?)` | verified email and status | 1 credit / $0.026, only when found |
| `quote(domains[], reveals?)` | what a batch would cost before running it | free |
| `budget()` | spent this month, the limit, the balance (Apollo master key or treg) | free |
| `get_icp()` / `set_icp(answers)` | the ICP scores are judged against (the rules are generated from the answers) | free |

## Design rules for agents

1. **No surprise spending.** The monthly budget is enforced inside the engine, not left to the agent's judgment. Paid tools take `max_spend`; past it or past the budget they refuse with a message that says what to do. `quote` prices a batch first.
2. **Reveals are separate and deliberate.** `sift_company` and `find_people` never reveal emails; an agent pays only for people it means to contact.
3. **Outputs explain themselves.** Every score carries its checks, every signal its source and quote, so an agent can justify an opener without inventing reasons.
4. **The ICP can be passed per call** (agents working for several clients) or saved once as the default (people).
5. **Errors are actionable,** e.g. "Budget reached: $4.80 of $5. Raise it with `set_budget` or ask the user." Missing keys name the environment variable to set.
6. **The same data sources as the extension.** `SIFT_PROVIDER=apollo|treg`, with `APOLLO_KEY` or `TREG_KEY` plus `TYPESAFE_KEY`, kept in environment variables and never echoed in outputs.
7. **Deterministic where possible.** Repeat calls within 7 days come from the cache at no cost, so retries and re-plans don't pay twice.

## How it's built

### Step 1: extract the core (no behaviour change to the extension)

Today `src/lib` is almost all plain TypeScript. Four files touch the browser:

| File | Browser dependency | Becomes |
|---|---|---|
| `storage.ts` | `chrome.storage` (keys, cache, saved, reveals, ledger, profile) | a `Store` interface; the extension uses chrome.storage, Node uses files in `~/.sift/` |
| `pipeline.ts` | `browser` for tabs and site scanning, plus the view state for the side panel | the engine returns results; the extension's view-state and tab parts move to `entrypoints/background.ts` |
| `site-scan.ts` | runs inside the tab via `executeScript` | the parser is shared; Node fetches the same pages itself (see Decisions) |
| `discover.ts`, `messages.ts` | extension messaging | stay in the extension |

Proof: all 133 extension tests and the smoke tests still pass, unchanged.

### Step 2: the MCP server

The tools above over stdio. The keys, budget and ICP come from the environment and `~/.sift/`. There are tests per tool with mocked Apollo and Jev, plus one live test (as `treg.live.test.ts` does today).

### Step 3: `SKILL.md`

Two or three workflows to start:
- **Qualify a list:** `quote`, confirm the cost, `sift_company` each domain, then a ranked summary.
- **Prep outreach for one account:** `sift_company`, then `find_people`, then `reveal_email` for the top contact, then an opener built only from the returned signals.
- **Budget-aware batch:** stop and ask when the budget would be crossed.

### Step 4: CLI with batch CSV

- `npx <pkg> acme.com` prints the panel's answer; `--json` gives the raw result.
- `npx <pkg> --from accounts.csv --out ranked.csv` runs a batch ranked by priority (60% fit + 40% timing). It has a concurrency limit, `--dry-run` to price it, and no reveals unless `--reveal top1`.

### Step 5: distribution

- npm package, README section and a short demo.
- **treg hub:** pitch Jason on publishing Sift as one treg tool (`sift.company`), so any treg agent can call it. That's co-marketing for both.

## Decisions

- **Package name:** `sift` and `sift-mcp` are taken on npm. Free as of 2026-10-07: `sift-gtm`, `getsift`, `sift-outbound`, `siftgtm`, `@aditya-v05/sift`. Leaning **`sift-gtm`** (short, says what it's for). Usage would be `npx sift-gtm mcp`.
- **Website signals outside the browser:** fetch the site's public pricing, blog, changelog and security pages directly. It's simpler than the extension's in-tab reading, but some sites block plain requests; when they do, the result says "website not read", as the extension already can. Ship it, behind a flag if it proves flaky.
- **Repo layout:** keep it in this repo as an npm workspace (`packages/core`, `packages/mcp-cli`, the extension where it is), so the core stays shared and tested together.

## Risks

- **Runaway spend from agent loops:** the budget is enforced in the engine, reveals are opt-in, and `quote` comes first.
- **Jev cost and latency in batches:** a concurrency limit, the 7-day cache, and one company's Jev calls already batched as today.
- **Keeping three front ends in sync:** all logic lives in the core. The wrappers only parse input and format output.
- **Rate limits** (Apollo, treg providers): reuse the extension's retry on 429, and back off in batch mode.
