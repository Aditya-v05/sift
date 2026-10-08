---
name: sift
description: Qualify companies for outbound and find who to contact, using Sift (MCP tools sift_company, list_contacts, reveal_email, quote, budget, get_icp, set_icp, or the `npx sift-gtm` CLI). Use when the user asks whether a company fits their ideal customer, why a company is worth contacting now, who to email at a company, to rank or qualify a list of accounts or domains, or to prepare outreach. Every result carries its reasons (checked requirements, sourced signals); use them instead of inventing any. Paid steps cost Apollo credits ($0.026 each through treg), so price batches first and reveal emails only for people the user will contact.
---

# Sift: qualify companies and find who to email

Sift answers three questions about a company from its domain:

1. **Does it fit?** A 0–100 fit score against the user's ideal customer profile (ICP). Each requirement is shown as met, near, unsure, not_met or unknown.
2. **Why now?** Timing (0–100) from sourced signals: hiring for relevant roles, headcount growth, funding, and the company's own website (pricing, blog, changelog, security pages).
3. **Who to contact?** The people most likely to own the problem the user solves, ranked 0–100. Emails are revealed separately, on request.

## Tools

Prefer the MCP tools. Use the CLI (`npx sift-gtm`, with `--json`) only when they aren't connected.

| Tool | Use for | Cost |
|---|---|---|
| `get_icp` | Check which ICP results are judged against | free |
| `set_icp(sells, icp, buyers)` | Set the ICP from the user's words; clears cached results | free |
| `quote(domains, reveals_per_company?)` | Price a batch and check it fits the budget | free |
| `sift_company(domain, contacts?)` | Fit, why now and top contacts for one company | 2 credits if new; free for 7 days after |
| `list_contacts(domain)` | All ranked contacts for a company already looked up | free |
| `reveal_email(domain, person_ids)` | Verified emails for chosen people | 1 credit per person found |
| `budget()` | Spend this month, the limit, the balance | free |

The CLI equivalents are `npx sift-gtm <domain> --json`, `npx sift-gtm --from list.csv --out ranked.csv`, `npx sift-gtm reveal <domain> <person_id>`, `npx sift-gtm icp`, and `npx sift-gtm budget`.

## Rules

- **Check the ICP first.** If `get_icp` returns none, ask the user what they sell, who their ideal customer is, and who buys. Then call `set_icp` with their words. Don't guess an ICP.
- **Price before you spend.** For more than a couple of companies, call `quote` and tell the user the cost before running. If the quote says it doesn't fit the budget, ask first.
- **Reveal deliberately.** Only reveal emails for people the user will actually contact. Usually that's the top-ranked one or two at companies with a strong fit (score ≥ 70). Never reveal everyone.
- **Use the reasons, not invented ones.** Explain fit with the returned `checks` and timing with the returned `signals` and their `evidence`. If a check is `unsure` or `unknown`, say so. If `website_read` is false, the site wasn't read; don't claim anything about it.
- **On `over_budget`, stop and ask the user.** Agents can't raise the budget; the user sets it with `SIFT_BUDGET_USD` / `SIFT_BUDGET` or `npx sift-gtm budget`. On `over_max`, decide whether the spend is worth it, or ask.
- **Don't use `refresh`** unless the user asks for fresh data. Cached results (up to 7 days) are free.

## Workflows

### Qualify a list of accounts
1. Check the ICP with `get_icp` (set it if missing).
2. Price the list with `quote(domains)` and tell the user the total.
3. Run `sift_company` for each domain, one at a time or a few at once.
4. Rank by `priority` (60% fit + 40% timing). Present a short table (company, fit, timing, top signal, best contact), with one line on why for the top few.
5. Offer to reveal emails for the top contacts at strong fits, with the cost (1 credit each).

### Prepare outreach for one account
1. Run `sift_company(domain, contacts: 5)`.
2. If the fit is weak, say so and ask whether to continue.
3. Pick the contact: the top-ranked person, or a better match for the user's offer among the top five (`list_contacts` for more).
4. Run `reveal_email(domain, [person_id])`.
5. Draft a short opener that cites one or two real signals from `why_now.signals` (quote the evidence where there is any) and the requirement the company clearly meets. Keep it to 3–4 sentences, with no claims beyond the returned data.

### Who should I talk to at this company?
Run `sift_company(domain)`. Answer with the top two or three contacts (name, title, rank) and the best persona. Don't reveal emails unless asked.

## Reading results

- `fit.verdict` is strong (≥ 70), partial (≥ 40) or weak. `fit.requirements` is the share of the user's requirements met; `fit.overall_judgment` is the model's holistic view.
- `why_now.verdict` is hot (≥ 67), warm (≥ 34) or quiet. Each signal has a `relevance` (0–100) to what the user sells.
- `contacts[].rank` is how likely the person owns the problem. `has_email: false` means Apollo has no email for them.
- `cost` reports what each call actually spent: `credits`, `usd` (through treg or Monid), and whether it was `cached`.

## Setup (for the user)

Keys come from the environment and are never stored: `TYPESAFE_KEY` (Jev, from typesafe.ai) and `APOLLO_KEY`, `TREG_KEY` (treg.to) or `MONID_KEY` (monid.ai); treg and Monid are pay per call, no Apollo plan needed. Add the MCP server to a client:

```json
{ "mcpServers": { "sift": { "command": "npx", "args": ["-y", "sift-gtm", "mcp"], "env": { "TYPESAFE_KEY": "…", "TREG_KEY": "…", "SIFT_BUDGET_USD": "5" } } } }
```
