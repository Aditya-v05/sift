# sift-gtm

**Sift for AI agents and the terminal.** Give it a company domain, and it tells you whether the company fits your ideal customer, why it's worth contacting now, and who to email. Each answer comes with its reasons.

It's the same engine as the [Sift Chrome extension](https://github.com/Aditya-v05/sift), running as an MCP server for agents and as a CLI for people. Bring your own keys; there's no Sift server.

```sh
npx sift-gtm mcp                                   # MCP server for Claude Desktop, Claude Code, Cursor…
npx sift-gtm gorgias.com                           # one company
npx sift-gtm --from accounts.csv --out ranked.csv  # a whole list, ranked
```

## Keys

Set these in the environment. They're kept in memory and never written to disk.

| Variable | What for | Where |
|---|---|---|
| `TYPESAFE_KEY` | Jev, which makes the fit, ranking and why-now judgments | [typesafe.ai](https://typesafe.ai) |
| `APOLLO_KEY`, `TREG_KEY` *or* `MONID_KEY` | Company and people data: your Apollo key, or [treg](https://treg.to) or [Monid](https://monid.ai) (pay per call, no Apollo plan needed) | Apollo: Settings → Integrations → API; treg: treg.to; Monid: app.monid.ai |
| `SIFT_PROVIDER` | `apollo`, `treg` or `monid`, when several keys are set | optional |
| `SIFT_BUDGET_USD` / `SIFT_BUDGET` | Monthly cap in dollars or credits (default 40 credits; `off` for no cap) | optional |

## For agents (MCP)

Add the server to your client's config:

```json
{
  "mcpServers": {
    "sift": {
      "command": "npx",
      "args": ["-y", "sift-gtm", "mcp"],
      "env": { "TYPESAFE_KEY": "…", "TREG_KEY": "…", "SIFT_BUDGET_USD": "5" }
    }
  }
}
```

It works in any MCP client. Quick setup for the common ones (verified with each tool's own `mcp add` where it has one):

```sh
claude mcp add sift -e TYPESAFE_KEY=… -e TREG_KEY=… -- npx -y sift-gtm mcp              # Claude Code
codex mcp add sift --env TYPESAFE_KEY=… --env TREG_KEY=… -- npx -y sift-gtm mcp          # OpenAI Codex
gemini mcp add -s user -e TYPESAFE_KEY=… -e TREG_KEY=… sift npx -y sift-gtm mcp          # Gemini CLI
```

- **Cursor** (`~/.cursor/mcp.json`), **Claude Desktop** (`claude_desktop_config.json`) and **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) use the `mcpServers` JSON above.
- **VS Code** (`.vscode/mcp.json`) uses `"servers": { "sift": { "type": "stdio", "command": "npx", "args": [...], "env": {...} } }`.
- **opencode** (`opencode.json`) uses `"mcp": { "sift": { "type": "local", "command": ["npx", "-y", "sift-gtm", "mcp"], "environment": {...} } }`.

There's a copy-paste version of each at [sift-through.vercel.app/agents](https://sift-through.vercel.app/agents#setup).

| Tool | Returns | Cost |
|---|---|---|
| `sift_company` | Fit score with each requirement (met / near / unsure / not met), why-now signals with evidence, the best persona, and the top contacts (no emails) | 2 credits if new; free for 7 days |
| `list_contacts` | All ranked contacts for a company already looked up | free |
| `reveal_email` | Verified emails for chosen people | 1 credit per person found |
| `quote` | What a batch would cost, and whether it fits the budget | free |
| `budget` | Spend this month, the limit, the Apollo, treg or Monid balance | free |
| `get_icp` / `set_icp` | The ideal customer profile results are judged against | free |

Through treg or Monid, a credit costs $0.026: about $0.05 for a new company and $0.026 per email.

**Built for agents to use safely:**
- **Budget:** the monthly budget is enforced inside Sift, and there's deliberately no tool to raise it.
- **Caps:** paid tools take `max_credits`.
- **Reveals:** looking a company up never reveals emails.
- **Errors:** they say what to do next, e.g. "Monthly budget reached… Ask the user to raise it".

[`SKILL.md`](SKILL.md) is a playbook for agents that load skills: the rules and the workflows (qualify a list, prepare outreach for one account).

## For people (CLI)

```sh
export TYPESAFE_KEY=… TREG_KEY=…
npx sift-gtm icp --sells "AI support QA software for SaaS companies." \
                 --icp "Series A–C SaaS companies, 50–500 employees, in the US, with large support teams." \
                 --buyers "VP Customer Experience, Head of Support, COO"
npx sift-gtm gorgias.com
npx sift-gtm --from accounts.csv --dry-run          # price it first
npx sift-gtm --from accounts.csv --out ranked.csv   # ranked by priority, best first
npx sift-gtm --from accounts.csv --out ranked.csv --reveal-top 1 --min-fit 70
npx sift-gtm reveal gorgias.com <person_id>
npx sift-gtm budget --usd 5
```

**The CSV input:**
- It uses the `domain` (or `website` / `url`) column, or the first column; duplicates are merged.
- The output is ranked by priority (60% fit + 40% timing), with the top signal and the best contact for each company.

**Storage:** results are cached for 7 days in `~/.sift` (set `SIFT_HOME` to move it). That folder holds lookups, revealed emails, your ICP and the spend ledger, but never keys.

## How it works

It runs the extension's engine (`src/lib` in the Sift repo) unchanged:
1. Apollo enriches the company, with exact checks for company size and country.
2. Jev judges your other requirements and the buyer persona.
3. Apollo's people search (free) runs, Jev ranks everyone, and Jev judges why now from job postings, headcount, funding and the company's own pages.

Without a browser, those pages are fetched directly; when a site blocks that, the result says the website wasn't read.

MIT · [Sift](https://github.com/Aditya-v05/sift) · [sift-through.vercel.app](https://sift-through.vercel.app)
