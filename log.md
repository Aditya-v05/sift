# Change log

Newest first. Each entry covers what changed, why, and how it was verified. Design details live in [`SPEC.md`](SPEC.md).

---

## 2026-10-08 — Monid live test, rerun three times

- **What:** reran `src/lib/monid.live.test.ts` three times in a row (key check, wallet, enrich, people search, job postings, one people/match polled after a 202).
- **Why:** the first live run earlier today failed once with no confirmed cause, before the fallback to the listed price for a run whose cost isn't filled in yet.
- **Verified:** 3 of 3 runs passed (2 tests each). Each run recorded exactly three charges of $0.026 (enrich, jobs, match; people search free). The wallet went from $0.766 to $0.532, a drop of $0.234, which is 9 × $0.026: the ledger and the wallet agree to the cent.

## 2026-10-08 — Monid as a third data source (dev-sift)

> "monid ... i think i have the ok since their integration docs allow it lets test - this is all in the dev-sift repo"

- **What:** Settings has a third source in the dropdown, "Monid, pay per call (no Apollo plan needed)", next to your Apollo key and treg. Lookups, people search, job postings and email reveals all work through Monid. The credit bar shows the Monid wallet, and prices and the budget read in dollars.
- **Why:** Monid (monid.ai) is a pay-per-call gateway like treg, with one wallet for many APIs. A live test showed its Apollo prices match treg's ($0.026 per paid call, people search free), so it's a real alternative for people without an Apollo plan.
- **Live test (2026-10-08, usepylon.com):**

  | Sift call | Monid endpoint | Input | Answer | Charged |
  |---|---|---|---|---|
  | Company | `/organizations/enrich` | `queryParams.domain` | 200, sync; Apollo's `{organization}` unchanged in `output` | $0.026 (`billing.reportedCost` 26000 micro-USD) |
  | Job postings | `/organizations/{organization_id}/job_postings` | `pathParams.organization_id`, `queryParams.per_page` | 200, sync; Apollo's `{organization_job_postings, pagination}` | $0.026 per call (21 postings, `billedUnits` 21, one charge) |
  | Find people | `/mixed_people/api_search` | `queryParams` with `organization_ids[]`, `person_titles[]` | 200, sync; Apollo's `{people, total_entries}` | free |
  | Reveal email | `/people/match` | `queryParams.id`, `reveal_phone_number: false` | **202 RUNNING**, then COMPLETED on the first poll of `/v1/runs/:id`; Apollo's `{person}` | $0.026 (`cost.value` on the polled run) |
  | Unknown domain | `/organizations/enrich` | | 200, `output: {}` | free |
  | Lookalikes | `/mixed_companies/search` | `lookalike_organization_ids[]` | **400**: unrecognized key | none |

  The wallet went from $1.000 to $0.922 after the three paid calls. It lags a call or two behind the runs, but every run's reported cost matched it. A bad key gets 401 from `/v1/auth/whoami`.
- **How:**
  - `access.ts` gains `Source`, `Gateway`, `GATEWAYS`, `isGateway` and `sourceKey`.
  - In `apollo.ts`, `route()` sends Monid calls to `POST /v1/run`. `monidRun()` turns Apollo's query and JSON body into `input.queryParams` (arrays as `key[]`, numbers and booleans typed) and the job-postings org id into `pathParams`.
  - `monidResult()` polls 202 runs (every 1 s, up to 30 s), returns `output`, and turns a failed run or an Apollo error status into an `ApiError('monid', …)`. It records the charge from `billing.reportedCost`, else `cost`, else the listed price per billed call (one live run finished before its cost was filled in).
  - Key check: `/v1/auth/whoami`. Balance: `/v1/wallet/balance`, parsed as a dollar balance tagged `gateway: 'monid'`. `balanceIsFor()` keeps a treg balance from showing as Monid's.
  - `onTregCost` is now `onGatewayCost` (the old name is kept), and `viaTreg` is `viaGateway` plus `gateway` in `useCredits`, so labels name the right gateway.
  - Discover shows a note through Monid instead of a failing search, and `searchOrganizations` refuses lookalikes before spending anything.
  - Host permission `https://api.monid.ai/*`. A 402 from Monid says the wallet is low.
- **Verified:**
  - `npm run compile`; 143 unit tests (10 new in `monid.test.ts`, with fetch mocked using the live response shapes);
  - `monid.live.test.ts` passes against the real API (about $0.08; skipped without `MONID_KEY`);
  - `npm run build` (the manifest lists `api.monid.ai`) and `npm run site:build`;
  - `npm run smoke`, 40 checks: 3 new Monid checks for the key field, the wallet on the credit bar, and dollar prices.
  - Total Monid spend for testing: $0.234 of the $1 free credit.
- **Agents (`sift-gtm`):** `MONID_KEY` works like `TREG_KEY`.
  - `SIFT_PROVIDER` accepts `monid`. Without it, Apollo is used first, then treg, then Monid.
  - `budget` reports `monid_balance_usd`. Live: `sift-gtm budget` with only `MONID_KEY` read the real wallet ($0.766).
  - 12 agent tests, one new for the provider choice.
- **Note:** Monid's terms page is generic boilerplate; their integration docs describe bring-your-own-key use.

---

## 2026-10-08 — Announcement bar: "Sift now runs on treg"

- **What:** a mint bar over the nav on both pages ("New · No Apollo plan? Sift now runs on treg, at $0.026 a call. See costs →"). It folds away once the nav turns white on scroll, and closes with ×, remembered per message in localStorage (`ANNOUNCE.id`; a new id shows the new message to people who closed the old one). While it shows, the hero starts below it. The text, link and id live in one `ANNOUNCE` constant in `site/Landing.tsx`.
- **Why:** treg support shipped in v0.3.x and the page only mentioned it in passing. Monid is not in the bar yet: it is only in dev-sift, so the bar would be false; add it to the text when Monid ships publicly.
- **Verified:** typecheck, site build; Playwright at 1440 and 390 px on / and /agents: no horizontal overflow, no page errors, the bar is hidden after scrolling, and gone after closing and reloading. Screenshots checked at both widths.

## 2026-10-08 — Reels, last pass: a readable terminal, no loading frame

- **What:**
  - Agents reel, terminal scene: the request fills the panel while it is typed, then folds to one dim line, and the five tool calls take the room at about 45 px (42 in 4:5), up from about 24, with shortened result lines (same facts, e.g. "Gorgias · fit 80 · timing 52").
  - Home reel: the fit scene starts at 4.75 s in the recording instead of 4.3 s, so it cuts from "One click on their homepage" straight to the panel with content, not its loading placeholders.
  - Re-exported `site/public/demo.mp4`, `demo-m.mp4`, `agents-demo.mp4` and the six Desktop `sift-reel-*` cuts. Posters unchanged (taken from the openings). The treg and older social videos are untouched.
- **Why:** the terminal text was too small on a phone, and the home reel showed a nearly empty panel for about half a second.
- **Verified:** stills of the terminal in 16:9, 4:5 and 1:1 before and after (a long line no longer clips in 4:5; the folded request line no longer collapses in 16:9); stills stepping the home cut; 1 fps contact sheets of the finals and a full-size frame from the 4:5 export; video type check; site build; smoke 37/37.

## 2026-10-08 — Reels, second pass: hooks with impact, the panel up close, a bigger answer

- **What:**
  - New openings for both reels (`video/src/Reel.tsx`), about 3.5 s, cut on a 120 BPM beat with big type from frame 1. Home: a full-bleed wall of about 200 account tiles under "200 accounts." sifts away while three fly forward as cards with real scores (Pylon 82/75, Gorgias 80/52, Help Scout 78/57): "3 worth an email.". Agents: "Which account first?" typed huge, the real tool calls in big mono, then "Gorgias. Hiring now." on mint.
  - Home fit, why now and who: no more half-frame of the cropped Pylon site. A tight crop of the real panel sits beside (16:9) or under (4:5, 1:1) the key fact in big type: "82%" with the four checks ticking in, "Hiring now." with three signals, "Dan G." with the made-up email landing at the reveal.
  - The answer list fills the frame (Fit 82%, Why now timing 75, Who Dan G. verified, Cost 3 credits); the agents list is bigger too.
  - After the reveal the recording shows the contact's full surname; the reel now paints it back to "Dan G.".
  - Site videos, posters and the six Desktop cuts (`sift-reel-{home,agents}-{16x9,4x5,1x1}.mp4`) re-exported.
- **Why:** the user found the openings bland and the why/who part of the home video weak: small type, and half the frame was a cropped page with cut-off text.
- **Verified:** type check of `video/`; stills of the hooks and of every split scene in 16:9, 4:5 and 1:1 looked at before rendering; 1 fps contact sheets of the finals; the Who scene stepped at 6 fps: only "Dan G." and `dan@usepylon.example` ever appear; ffprobe on exports (h264, yuv420p, tv range, BT.709; 60 fps social, 30 fps site); site build and smoke.

## 2026-10-08 — Showreel videos: the site's demos re-cut as a motion-design reel around real footage

- **What:** a new Remotion edit, `video/src/Reel.tsx`, with two reels:
  - `home` (the extension, about 26 s) replaces `site/public/demo.mp4` (now 1600×900), `demo-m.mp4` (now 720×900) and their posters;
  - `agents` (sift-gtm, about 22 s) replaces `agents-demo.mp4` and its poster.
  - Each is also rendered for feeds at 16:9, 4:5 and 1:1 (60 fps), exported to the Desktop as `sift-reel-{home,agents}-{16x9,4x5,1x1}.mp4` with the LinkedIn/X recipe (yuv420p, tv range, BT.709, silent AAC, faststart, level 4.2).
- **The look:**
  - a HUD on every shot: corner labels, a timecode, a progress hairline, and a spec line with Sift's real numbers (fit 82%, timing 75, "quote · 3 companies · 0 credits", fit 80/78/83);
  - spring-driven type in Archivo (variable weight and width) and hard-cut word beats ("FIT." "WHY NOW." "WHO." / "QUOTE." "SIFT." "RANK.");
  - layered band wipes and a 3D tile grid that flips to show ICP fit;
  - real footage in between: the usepylon.com recording through `Demo.tsx`'s camera and text patches, so the email is the made-up `dan@usepylon.example`, and the real agent session from `site/agent-session.json`.
- **Why:** the user asked for videos in the style of a motion-design reel posted on X, to replace the site's videos and set the style for new ones. A Sift version keeps real product footage in it, so it shows the product working rather than motion alone.
- **Verified:**
  - type check of `video/`;
  - looked at stills and contact sheets of every scene in all three shapes (legibility, nothing cut off or overflowing);
  - checked the reveal window frame by frame at 6 fps: only `dan@usepylon.example` is visible, and the clips stay inside the checked ranges (1.0–3.85, 4.3–7.4, 7.9–14.0 s);
  - ffprobe on the exports (h264 + aac, yuv420p, tv range, BT.709);
  - site build and smoke.
- **Kept:** the old compositions (`SiftDemo*`, `SiftSocial*`, `Treg*`, `Agent*`) still render; `Demo.tsx` and `AgentDemo.tsx` only gained exports.

## 2026-10-08 — /agents session: the short version first, the full transcript folded

- **What:** the "A real session" section now shows the request in one line, the tool calls as one line (`quote · get_icp · sift_company ×3 · 0 credits`), the agent's ranking (fit and timing per company) and one sentence on the top account. The full, unedited prompt, every tool call and the agent's whole answer sit under "Read the full transcript" (a `<details>`).
- **Why:** the full transcript under the video was too much text; the video already plays the session.
- **Verified:** site build; Playwright at 1440 and 390 px: no horizontal overflow, no page errors, the summary rows animate in, and opening the transcript shows all 5 tool calls.

## 2026-10-08 — Footer email card: opening mail is the main action

- **What:** the Email card's link now opens the visitor's mail app with the subject "Sift" prefilled (`mailto:…?subject=Sift`, tooltip "Opens your email app"). The Copy button is now an outlined, muted secondary control instead of a solid cream button.
- **Why:** the solid Copy button drew the eye, so the card read as copy-only even though clicking it already opened mail.
- **Verified:** site build; Playwright screenshot at 1440 px; the link's href is `mailto:adityaspark05@gmail.com?subject=Sift`; Copy still turns mint on success.

## 2026-10-08 — Micro-interactions, round two: nav scrollspy, setup stepper, arrows, copy morph, focus

> "https://www.microinteractionsui.com/ - for more micro reactions"

Patterns from MicroInteractions UI, rebuilt in plain CSS and two small hooks (no Tailwind or Motion, no new dependencies). Everything is driven by scrolling, clicks or keyboard focus, and is off under reduced motion.
- **Nav scrollspy:** one indicator slides to the link for the section you're reading (How it works, Costs on home), and fades out between sections. On /agents, Agents is marked as the current page. The links carry `aria-current`.
- **Setup stepper (/agents):** Get two keys, Add Sift to your agent, Ask in plain words. The rule between steps fills as you scroll, and each dot lights when the line reaches it. It's lines only, and stacks vertically on phones. Under reduced motion it shows fully lit.
- **Arrows:** Install Sift, the hero's "New: Sift for AI agents", and /agents' "Set it up" and "See a real session" have an arrow that slides out and back in on hover or focus.
- **Copy buttons:** "Copy" slides up and out as "Copied ✓" slides in, in the same cell, so the button never changes size.
- **Focus:** keyboard focus gets a ring that settles in, plus the same feedback as hover (buttons, nav, tabs, contact cards, footer links). Setup tabs now move with the arrow keys, Home and End.
- **Verified:** Playwright at 1440 and 390 px, with and without reduced motion, on / and /agents (66 checks, scratchpad `micro-verify.mjs`):
  - the indicator sits under the active link (within 0.2 px) at #answers and #costs, and no link is active at the top or in privacy;
  - the stepper goes 0 → 1 → 2 → 3 lit while scrolling;
  - ArrowRight moves the tab and focus, and the underline follows;
  - both copy buttons put the right text on the clipboard without resizing;
  - there is no horizontal overflow and there are no page errors.
- **Also run:** compile, site build and smoke all pass.

---

## 2026-10-08 — Footer: contact cards instead of pill buttons

> "these contact buttons can be made a bit good looking"

- **What:** the maker strip's three pills (Portfolio, Email me, GitHub) and the separate email line are now three stacked cards. Each has an icon, a label, the real destination in mono (the portfolio domain, the address, @Aditya-v05) and an arrow. The portfolio card is lightly highlighted.
- **Hover:** the border turns mint, the icon tilts, the arrow nudges.
- **Copy:** the email card has a Copy button that pops to "Copied ✓".
- **Phones:** the cards go full width with a smaller mono line so the whole address fits.
- **Verified:** at 1440 and 390 px; copy puts `adityaspark05@gmail.com` on the clipboard; no overflow or page errors.

---

## 2026-10-08 — Micro-interactions on both pages, and a full check

> "can u verify and add micro reactions and animations wherever u can"

- **Motion,** driven by scrolling and clicks only (no cursor-following), with all of it off under reduced motion:
  - **/agents session:** plays out when it scrolls in. Each tool call lands in order, its mint dot pulses as if running, then its result line draws in and fades up; the agent's answer comes last.
  - **Hero command:** a blinking cursor, and one soft mint glow on arrival.
  - **Copy buttons:** pop to "Copied ✓".
  - **Setup:** one underline slides between the tabs (it follows wrapped rows on phones), and the code crossfades.
  - **Tools:** rows stagger in; a hovered row tints and its name nudges.
  - **Guardrails:** each card's top rule sweeps in, and cards lift on hover.
  - **CSV:** rows land one by one.
  - **Home page:** the receipt prints line by line, and FAQ answers ease open.
  - **Buttons:** press slightly on click.
- **Verified** (Playwright at 1440 and 390 px, both pages, after scrolling through):
  - every section revealed, every animated item fully visible at the end, no sideways scroll;
  - the tab underline within 0.5 px of the active tab for Codex, VS Code and opencode;
  - copy puts the exact config on the clipboard and shows "Copied ✓";
  - the session video plays;
  - reduced motion shows everything at once;
  - every anchor exists and every link answers (GitHub 200; npm 403 to robots; `log.md` and LICENSE rechecked to 200 after a 429).
  - The only console error is `/_vercel/insights/script.js` 404 locally, which exists on Vercel.
  - Extension unchanged: 133 tests, 11 agent tests, build and smoke pass.

---

## 2026-10-08 — /agents: setup for every common agent, not just Claude

> "can we do this for multiple ai agents not just this?"

- **Setup tabs:** Claude Code, Codex, Gemini CLI, Cursor, Claude Desktop, VS Code (Copilot agent mode), Windsurf, opencode, and "Any MCP client" (the stdio command and env vars). Each has its exact config or command and a copy button. The hero's fine print names them. `agent/README.md` gains the same setups.
- **How the formats were checked:**
  - **Claude Code, Codex and Gemini CLI:** I ran each tool's own `mcp add` in a throwaway config and used the config it wrote. Codex: `[mcp_servers.sift]` TOML, and `codex mcp list` shows it enabled. Gemini: `mcpServers` in `~/.gemini/settings.json`.
  - **opencode:** connected live ("✓ sift connected") with `"mcp": {"sift": {"type": "local", "command": [...], "environment": {...}}}`.
  - **Cursor, Claude Desktop, VS Code and Windsurf** aren't installed here; they use their documented formats.
- **Real sessions in other agents:** not possible yet without logins.
  - opencode's free models refuse headless runs ("OpenCode's free tier can only be used from within OpenCode");
  - Codex reports "Not logged in";
  - Gemini CLI isn't installed and needs a Google sign-in.

---

## 2026-10-08 — Launch prep for sift-gtm: a real agent session, the /agents page, and a video (branch `agents-launch`)

> "before we publish we need to make sure there is a video for posting and also i need a website tab or something talking about sift for agents"

- **A real agent session:** `claude -p` (Claude Code 2.1) with only Sift's MCP server connected was asked to rank gorgias.com, kustomer.com and helpscout.com. It:
  - priced first (`quote`: 3 cached, 0 credits) and read the ICP;
  - ran `sift_company` three times with `max_credits: 0`;
  - answered with a ranking and evidence ("12 open roles, 8 posted in the last 30 days"), naming the top contact without revealing any email, and flagging its own caveats.

  Sift spent 0 credits; the Claude run cost about $0.10. The transcript is saved as `site/agent-session.json` (no emails in it).
- **The /agents page** (`site/agents.html`, `site/Agents.tsx`; Vite now builds two pages, and `vercel.json` sets `cleanUrls` so it serves at `/agents`):
  - a hero with an "MCP" slat wall, `npx sift-gtm mcp` with a copy button, and links to setup and the session;
  - the video and the real session (request, tool calls with results, the agent's answer);
  - the tools with their costs; four guardrails;
  - setup tabs (Claude Desktop / Cursor JSON, a Claude Code one-liner) plus SKILL.md;
  - "for people too": the real 3-company CSV run.

  The nav, footer, eyebrow and reveal are shared with the home page; section links became `/#…`. The nav gains "Agents", the footer "For agents (MCP)", and the home hero's fine print "New: Sift for AI agents (MCP) →". It has its own `og-agents.png`.
- **The video** (`video/src/AgentDemo.tsx`, compositions `AgentLandscape` / `AgentPortrait` / `AgentSquare`, 18.9 s):
  1. hook card: "Give your agent Sift.";
  2. the request typed in;
  3. the five real tool calls with their results ("It prices first. Cached, so $0.");
  4. the answer, folded to the ranking and the Gorgias line ("It answers with evidence, not vibes.");
  5. end card: `npx sift-gtm mcp`.

  It's exported for X and LinkedIn as `~/Desktop/sift-agents-{16x9,4x5,1x1}.mp4`, with thumbnails; a 1280-px web cut is on the page.
- **Verified:**
  - /agents at 1440 and 390 px: no overflow or page errors, video playing;
  - compile, 133 tests, 11 agent tests and the site build pass.
- **Still pending:** releasing 0.1.0 from npm's staged packages (the user's step), so `npx sift-gtm` works.

---

## 2026-10-07 — sift-gtm: Sift for agents (MCP server + CLI), built

> "lets start building this shall we"

- **What:** a new package in `agent/` (npm name `sift-gtm`, not published yet), with:
  - **MCP server** (`sift-gtm mcp`, stdio): tools `sift_company`, `list_contacts`, `reveal_email`, `quote`, `budget`, `get_icp` and `set_icp`, plus server instructions telling agents to work cheap-first.
  - **CLI:** one company (pretty-printed, or `--json`); batch `--from list.csv --out ranked.csv`, ranked by priority, with `--dry-run`, a concurrency limit and `--reveal-top N --min-fit 70`; plus `reveal`, `icp` and `budget`.
  - **`SKILL.md`:** the agent playbook (rules, three workflows, how to read results).
- **How:**
  - esbuild bundles the extension's `src/lib` unchanged, with `wxt/browser` aliased to a Node stand-in: `~/.sift/store.json` (atomic writes, owner-only permissions), keys in memory only.
  - The website is read by running the same `scanSite` in a happy-dom page; sites that block plain fetches show as "website not read".
  - The only change to shared code is an optional `site` hook on `runLookup`.
- **Safety:**
  - the monthly budget (default 40 credits; `SIFT_BUDGET` / `SIFT_BUDGET_USD` / `sift-gtm budget`) is enforced before any spend, and no MCP tool raises it;
  - `max_credits` on paid tools;
  - lookups never reveal emails;
  - structured errors say what to do;
  - keys come from the environment only.
- **Verified:**
  - 11 agent tests with Apollo and Jev faked: ICP and keys required, cache free, `max_credits` and budget refused before spending, quote, reveals charged once, treg dollar pricing, keys never on disk, and the full MCP flow through a real client;
  - live with the real keys: gorgias.com 80% strong fit, timing 52, 30 contacts, 2 credits, the repeat free;
  - the built binary over stdio from an MCP client;
  - a batch of 3 companies (one cached, one duplicate) ranked into CSV for 4 credits;
  - the packed tarball installed and run (4 files, 33 kB, no keys);
  - extension unchanged: 133 tests, smoke 37, build and site build.
- **CI:** now runs the agent tests and builds the CLI. Root `compile` type-checks `agent/` too.

---

## 2026-10-07 — Plan: Sift for agents (AGENT_PLAN.md)

> "agents and people both need to be satisfied but agents is the priority now"

- **What:** a written plan for one package with two front doors: an MCP server for agents (the priority) and a CLI with batch CSV for people, plus a `SKILL.md` playbook. All three sit on a core extracted from `src/lib`, so the extension is unchanged.
- **Contents:**
  - the agent tools and their costs;
  - design rules (budget enforced in the engine, reveals opt-in, `quote` before batches, outputs with their reasons);
  - the build order and the four browser-dependent files to split;
  - decisions and risks.
- **Package name:** `sift` and `sift-mcp` are taken on npm; the plan proposes `sift-gtm` (free on 2026-10-07).
- **Status:** nothing built yet.

---

## 2026-10-07 — Fix: contact email on the website

- **What:** the maker strip's email had a missing letter. It now reads `adityaspark05@gmail.com` (`EMAIL` in `site/Landing.tsx`, used for the address and the Email me button).

---

## 2026-10-07 — treg demo video for the co-marketing post

> Jason Zhou (treg): "feel free to make a demo post showing Treg in your app and I will repost!"

- **Recording:** the user recorded Sift on v0.3.1 against a new ICP (treg's own customer: seed–Series B AI agent startups, 10–200 people, US):
  - Settings: Apollo → treg, "Sift is using treg";
  - browserbase.com: 81% strong fit, 4 of 4 met, why now (hiring, headcount +25%, the Okta partnership from their blog);
  - Paul Klein (Founder), email revealed for $0.026; $0.08 for the whole lookup.
- **Edit:** the Remotion edit is now story-based (`Story` in `video/src/Demo.tsx`). The Pylon demo is one story and the new `TREG` another, each with its own clips, camera, captions, text patches and cards.
  - Captions: "Pick treg. No Apollo plan needed." / "One key. That's the setup." / "One click on their homepage." / "The same Apollo data, through treg." / "Who to email, ranked." / "Every click priced in dollars." / "Pay per call. People search is free."
  - Hook card: "Sift × treg / No Apollo plan? Sift runs on treg now."
- **Clean-up:**
  - Chrome's account buttons are covered with stretched strips of the empty toolbar (native colour);
  - the email is blurred from the exact frame and overdrawn with `paul@browserbase.example`;
  - the "n engineering team…" label (a bug, fixed in the previous entry) is overdrawn with the correct text.
- **Output:** 16:9, 4:5 and 1:1, 27.3 s, exported for X and LinkedIn (H.264 High, yuv420p tv, BT.709, silent AAC, fast start), with text-free thumbnails. All are on the Desktop as `sift-treg-*`.
- **Verified:** every frame of the reveal in all three cuts shows "Revealing…" then only the made-up address. The patches match the panel's white.

---

## 2026-10-07 — Fix: company checks lost the "a" of "an"

> Found in the treg demo recording: the check read "n engineering team shipping AI features".

- **Cause:** the rule maker strips leading filler words ("with", "a", "an", "the"…) from each ICP phrase, but without word boundaries, so "with an engineering team" lost "with", then the "a" of "an".
- **Fix:** filler words match whole words only (`\b`, with "an" tried before "a").
- **Tests:**
  - the demo ICP now yields "engineering team shipping AI features";
  - a phrase list with "with a large support team, and annual contracts, in the healthcare space" keeps every word that starts like a filler;
  - 133 tests pass.
- **Note:** profiles saved before the fix keep the old wording until rules are regenerated in Settings.

---

## 2026-10-07 — Usage tracking: a private daily snapshot, and website analytics

> "can we track the usage somehow" / "yes set up 2 and 3"

- **Daily snapshot:** a new **private** repo, `Aditya-v05/sift-stats` (private so traffic and referrers aren't published).
  - Its `Snapshot` workflow runs daily at 06:17 UTC, and on demand.
  - It saves the public repo's release downloads (per release, cumulative). With a `TRAFFIC_TOKEN` secret (a fine-grained token, Administration: Read-only on `Aditya-v05/sift`), it also saves views, unique visitors, clones and referrers.
  - Data is merged by date, since GitHub keeps only 14 days, and summarised in `data/README.md`.
  - The first run on GitHub succeeded (downloads recorded; traffic waits for the token). A local run with a token recorded 7 days of traffic.
- **Website analytics:** `@vercel/analytics` (`<Analytics />` in `site/main.tsx`), cookieless and aggregated. It only collects once Web Analytics is enabled for the `sift` project in Vercel.
  - PRIVACY.md gains a "The website" section saying so, and that the extension sends nothing.
  - The site's privacy line reads "no analytics in the extension".
- **Verified:**
  - the built site includes the `/_vercel/insights` script;
  - compile, tests, build and smoke pass;
  - npm audit: 0 vulnerabilities.

---

## 2026-10-07 — v0.3.1: the data-source dropdown no longer snaps back

> A screen recording: picking treg in the dropdown flipped straight back to Apollo.

- **Cause:** Chrome loads an unpacked extension's pages fresh from disk, but its background worker keeps running the old code until the extension is reloaded. The new Settings page asked the old background to `useSource`; it didn't know that message and answered with nothing. The page assumed an answer, threw, and the controlled `<select>` fell back to Apollo.
- **Fix:**
  - the dropdown no longer depends on the background: picking a source shows it at once, and the keys section tests that source's saved key and saves the switch when it connects ("Switching to treg…" meanwhile; "Still using … : the key below didn't connect" if it fails);
  - the costs-section link uses the background when it answers and otherwise hands the switch to the keys section without scrolling;
  - no answer at all is handled (`switchSource` returns null).
- **Verified with real keys:** with the background answering and with it answering nothing (simulating an old worker), the dropdown went Apollo → treg and the costs link went treg → Apollo, both saved, no page jump, no errors. Compile, 131 tests, smoke 37 and the 0.3.1 zip pass.

---

## 2026-10-07 — v0.3.0: treg comes to public Sift

> "lets bring treg to public sift"

- **What:** merged the private `dev-sift` work into the public repo, so the public extension can use treg instead of an Apollo key. The pieces:
  - the transport (`src/lib/access.ts`, `route()` in `apollo.ts`);
  - dollar prices, balance and budget;
  - Settings with keys that save themselves, a data-source dropdown and an in-place switch.

  The `dev-sift` entries below describe each step. Before merging, every private commit was scanned for keys and tokens (none).
- **Conflicts:** README kept the public redesign, with treg added into it. log.md keeps both sides' entries.
- **Public text:**
  - README: the header line; a treg row in "What you need" ($0.026 per paid action, finding people free); treg in privacy and permissions; a "Through treg" costs table; setup without "Save & test"; the live treg test command; test counts updated to 131 unit tests and 37 browser checks.
  - Website FAQ: "What do I need?" now names either key, plus a new "What is treg?".
  - Website: costs text, privacy list and footer.
  - Store listing: the `treg.to` host-permission justification.
  - PRIVACY (from the merge): what treg sees.
- **Version:** 0.3.0. The manifest adds the `https://treg.to/*` host permission.
- **Verified:**
  - compile, 131 tests, `wxt build`, smoke 37 checks, site build;
  - a real treg lookup of linear.app in the public build: 71% fit, why now and contacts, "Reveal email ($0.026)", $0.052 recorded.

---

## 2026-10-07 — Repo renamed to `Aditya-v05/sift`: links updated

- **What:** GitHub reported the repo moved to `Aditya-v05/sift`. The About settings (website, description, topics) carried over.
- **Updated:**
  - the local remote;
  - every link to the old name in README (release download, CI badge, CI link), PRIVACY, the store listing and the website (`REPO` in `site/Landing.tsx`: GitHub, Install, privacy, changelog, issues, license).

  The old URLs still redirect, but the links now point at the real address. Older `log.md` entries keep the name they had at the time.
- **Verified:** compile and the site build pass; the Vercel deploy and CI for this commit were checked after the push.

---

## 2026-10-07 — GitHub About section and a test line in the README

> Pasted suggestions: fix the repo's About website (still the old sift-rosy-omega.vercel.app), add a description and topics, and state the test numbers once, low in the README.

- **About:**
  - website set to https://sift-through.vercel.app (was https://sift-rosy-omega.vercel.app);
  - description "Open-source Chrome extension for outbound research.";
  - topics: chrome-extension, sales, outbound, gtm, apollo, open-source.
- **README:** under How it works, "Tested with 123 Vitest unit tests and 31 Playwright browser checks, with CI on every push."
- **Verified:** the numbers were re-run on `main` before quoting them (123 passed, 31 smoke checks, 0 failures). `gh repo view` shows the new About values.

---

## 2026-10-07 — README: install made obvious; first GitHub release

> "Your GitHub README should make installation extremely obvious near the top: what Sift does, screenshot/demo, install instructions, Apollo + Jev requirements, privacy/no backend."

- **README order:**
  1. a centred header with a one-line promise and links (Download, Install, Website, Privacy) plus CI and license badges;
  2. a demo GIF (`docs/demo.gif`, 800 px, 10 fps, 4.8 MB, made from the site's demo video, with the made-up email);
  3. **What it does** in three bullets;
  4. **Install** in four steps from a release zip, no npm needed, plus how to update;
  5. **What you need**: an Apollo key and a TypeSafe (Jev) key, where to get each, and what they cost;
  6. **Privacy: no backend**.

  The previous detail follows (more features, costs, setup in detail, build from source, how it works, develop). The `#install` anchor is kept, since the website's buttons link to it.
- **Release:** `v0.2.0` with `sift-0.2.0-chrome.zip` (208 KB, from `npm run zip`). Unzipped, it loads in Chromium: manifest Sift 0.2.0, options page renders, no errors.
## 2026-10-07 — Links follow the public repo's rename to `Aditya-v05/sift`

- **What:** the public Sift repo was renamed from `extens` to `sift`. README (including the intro that names it as the public version), PRIVACY, the store listing and the site's `REPO` constant now link to `Aditya-v05/sift`. Older log entries keep the old name.
- **Verified:** compile passes.

---

## 2026-10-07 — dev-sift: switch in place, data source as a dropdown, balance loads itself

> "wouldn't it be nice if when i click the switch to so and so button it automatically switches instead of punting me back to the top ... if i keep adding stuff i think a drop down would be cool"

- **Switch in place:** "Switch to your Apollo key" / "Switch to treg" in the costs section now switches right there when that key is saved and still connects, and confirms with "Switched to …". The page stays where it is (it moved 19 px as the text changed). Only when the key is missing does it scroll to API keys with that source picked; a key that fails shows why.
  - How: a new background message, `useSource`, tests the saved key for the source and saves the switch only if it connects.
- **Dropdown:** the data source is a dropdown, drawn as a line like the other inputs. The list is a `SOURCES` array, so new sources are one entry. Choosing a source with a saved key switches at once; otherwise its key field opens.
- **Balance:** it loads by itself whenever the shown balance doesn't match the source in use (e.g. right after a switch), instead of saying "Save and test your treg key to see its balance".
- **Verified with real keys:**
  - the treg balance loaded on its own ($0.28);
  - the costs-section switch moved to Apollo with no page jump, and the dropdown followed;
  - the dropdown back to treg switched at once;
  - no page errors;
  - smoke 37 and 131 tests pass.

---

## 2026-10-07 — dev-sift: settings without a Save button; budget in dollars on treg

> "this flow is annoying - save and test and change budget limits and its not intuitive"

- **Keys save themselves:**
  - a key is tested 0.7 s after you stop typing or paste;
  - it is kept once it connects ("Connected and saved");
  - a key that fails shows why and isn't saved;
  - the Save & test button is gone.
- **Switching is one click.** Picking a source whose key is already saved switches at once. Otherwise its key field opens with "Paste your treg key below. Sift switches as soon as it connects." The line under the choice always says which source Sift is using.
- **Budget:**
  - saves itself (0.6 s after typing) and confirms with "Saved";
  - through treg it is typed in dollars (`settings.budgetUsd`, converted to paid calls at $0.026 for the over-budget check);
  - the credit bar, the over-budget screen, the reveal-all warning and Discover's prompt show it in dollars on treg.
- **Verified:**
  - with the real keys: picking treg and pasting its key switched in 1.9 s, then Apollo and treg again switched instantly, and a $10 budget saved as 384 calls;
  - smoke: 37 checks (no Save button, a $5 budget saved as 192 calls, the dollar budget in the bar);
  - 131 tests pass.
- **treg ledger note:** each charge appears twice in treg's history (reserve, then settle for the same call), which is not a double charge.

---

## 2026-10-07 — dev-sift: treg compared with Apollo live, and a clearer switch

> "lets choose a website and check if apollo and treg both work" / "now try revealing an email in both" / "how can i switch keys is the ui good enough"

- **Side-by-side on gorgias.com** (built extension, fresh browser per mode):
  - the key test, company record (same Apollo id, 520 employees), requirement checks, hiring signals and all 30 people (same ids) are identical;
  - fit 80 vs 78 and timing 48 vs 51 differ only through Jev, which scores with probabilities, since every Apollo input matched;
  - revealing the top contact returned the same verified address in both (compared by hash, shown masked);
  - Apollo charged 1 credit and treg exactly $0.026, which Sift recorded.
  - Cost: 5 Apollo credits. treg's own ledger showed $0.026 charges, free people searches, and a balance drop exactly equal to Sift's record.
- **Switching UI:**
  - picking the other data source now says "Sift still uses your Apollo key. Press Save & test keys to switch." until you save;
  - the hiring-signals setting reads "+$0.026 per lookup" in treg mode.

  Smoke is now 35 checks, and 131 tests pass.

---

## 2026-10-06 — dev-sift: treg as an alternative to Apollo (private repo)

> "lets build treg as an option instead of apollo - let us maintain separate repo for dev-sift or something thats private"

- **Repo:** `Aditya-v05/dev-sift` is private, cloned from `extens` with its history. The public `extens` is untouched.
- **How:** treg's `apollo.*` endpoints pass Apollo's method, query and body through unchanged and return Apollo's response verbatim. So the only change is the transport:
  - `Access` (`src/lib/access.ts`) is either `{via: 'apollo', key}` or `{via: 'treg', key}`;
  - `route()` in `apollo.ts` sends each call to `api.apollo.io` or `treg.to/call/<endpoint>`;
  - mapping, ranking, caching and the UI flow are shared.
  - The one difference: treg takes the job-postings org id as `?organization_id=`.
- **Endpoint mapping (verified live 2026-10-06):**
  - people search → `apollo.people.search` (free);
  - enrich → `apollo.companies.enrich`;
  - jobs → `apollo.companies.jobs`;
  - lookalikes → `apollo.companies.search` (passes `lookalike_organization_ids` through);
  - people/match by id or LinkedIn → `apollo.people.enrich`.

  Each paid call is $0.026. Key check: `GET /auth/me` (401 on a bad key). Balance: `GET /orgs/{id}/balance`.
- **Money:**
  - every call carries `X-Treg-Route-Max-Cost: 0.06` (treg has no default cap on direct calls);
  - `X-Treg-Cost-Micro` is recorded into `ledger.usdMicro`;
  - the credit bar shows the treg balance and dollars spent;
  - buttons show `$0.026` / `$0.052`;
  - the budget counts paid calls;
  - HTTP 402 explains a low balance.
- **Settings:** under API keys, a choice of "Your Apollo key" or "treg (pay per call, no Apollo plan needed)", with the matching key field. The `treg.to` host permission is added. README and PRIVACY are updated (treg sees the same requests Apollo would).
- **Verified:**
  - 8 new unit tests (routing, identical bodies, the org id query, cost recording, 402 message, prices, balance), 131 passing;
  - a live test of Sift's own functions through treg: key check, balance, enrich, people search, jobs and lookalikes, with charges recorded at exactly 26000/26000/26000 micro and search free;
  - smoke: 34 checks, including the treg settings swap, the treg credit bar and dollar prices;
  - compile and build pass.
  - Testing spent about $0.18 of the treg balance: the endpoint checks plus one live run.

---

## 2026-10-06 — Social videos checked against LinkedIn and X upload specs

> "i am not sure if the video is linkedin safe can u verify"

- **Already within spec:**
  - MP4 with H.264 High profile, 30 fps, 20.9 s, 5–7 MB;
  - aspect ratios 16:9, 1:1 and 4:5, all within LinkedIn's 1:2.4–2.4:1 range and X's 1:2.39–2.39:1;
  - resolution at most 1920×1080;
  - square pixels;
  - fast start (moov before mdat).
- **Fixed:** full-range colour (`yuvj420p`), which platforms can wash out or crush on re-encode, is now standard-range `yuv420p` tagged BT.709. The files had no audio track, a known cause of upload-processing hiccups, so a silent stereo AAC track (48 kHz) was added. Level 4.1. The Desktop files are replaced.
- **Verified:**
  - ffprobe on all three;
  - a frame compared before and after (identical colour, made-up email intact);
  - all three decode cleanly.

  The exact command is in `video/README.md`.

---

## 2026-10-06 — Social thumbnails and a landscape cut

> "can we generate a thumbnail as well" / "i think the text thing is not necessary" / "having a landscape orientation is fine because many people post using that"

- **Thumbnails:** no text, just the panel on Pylon at 82% strong fit with why now, framed like each video. Three sizes: `sift-thumb-4x5.png`, `sift-thumb-1x1.png`, `sift-thumb-16x9.png`.
- **Landscape:** `SiftSocialLandscape` (1920×1080, 16:9), the same social cut with the page beside the panel.
- **A mistake caught before anything left the machine:** the first thumbnail render seeked `clean.mp4` from a Remotion still. It landed on a later frame that showed the real email unblurred. Those two PNGs were only in the git-ignored `video/out/` and were deleted at once; they never reached the Desktop or git. Thumbnails now come from a still image extracted at exactly 6.6 s (`video/public/thumb-frame.png`, kept local). The README warns against seeking video from a still.
- **Verified:**
  - all three thumbnails viewed: no contact or email in frame;
  - every frame of the landscape cut's reveal shows only `dan@usepylon.example`;
  - the type check passes.
- **Files:** everything is on the Desktop.

---

## 2026-10-06 — Demo video cut for LinkedIn and X

> "can u make the demo fit for like a linkedin / x post"

- **Formats:** two new Remotion compositions from the same timeline:
  - `SiftSocialPortrait`, 1080×1350 (4:5, the tallest shape LinkedIn's feed shows in full, and fine on X);
  - `SiftSocialSquare`, 1080×1080 (works anywhere).
- **What's different from the site cut** (feeds autoplay muted and get scrolled past):
  - a hook card first: "a free Chrome extension / Know who to email *before you leave their homepage.*";
  - framing tighter on the panel;
  - captions about 30% bigger;
  - the end card held 3.7 s, with "Free and open source, on your own Apollo + Jev keys" and the URL;
  - a thin mint progress line along the bottom.

  Each runs about 21 s, at CRF 18 (6–6.5 MB), since the platforms re-encode uploads anyway.
- **Code:** the formats are now config objects (`FORMATS` in `video/src/Demo.tsx`). The site cuts' framing, sizes and timing are unchanged. A new script, `npm run render:social`, renders both; the README is updated.
- **Verified:**
  - stills at every moment;
  - every frame of the reveal in both cuts shows only `dan@usepylon.example`;
  - the type check passes.
- **Files:** `sift-social-4x5.mp4` and `sift-social-1x1.mp4` are on the Desktop.

---

## 2026-10-06 — Deleted the `site-redesign` branch

> "delete it - and give me the video - mp4 we used"

- **What:** deleted `site-redesign` on GitHub and locally. Its only unique commit history included a plain cut of the demo that showed a real person's email for about one frame. Everything on the branch had already been squash-merged into `main`; a diff showed only newer log and tsconfig changes on `main`. No pull requests used it.
- **Note:** GitHub can keep unreachable commits reachable by their exact SHA for a while until it garbage-collects them; nothing links to them any more.
- **Videos:** copied to the Desktop (the raw recordings stay local and out of git):
  - `sift-demo.mp4` and `sift-demo-vertical.mp4`: the web versions on the site;
  - `sift-demo-hq.mp4` and `sift-demo-vertical-hq.mp4`: the full-quality Remotion renders.

---

## 2026-09-30 — CI fix: keep the video project out of the extension's type check

> "somehting failed?" (GitHub's "CI: All jobs have failed" email after the release)

- **What failed:** CI's type check on `main`. The root `tsconfig.json` inherits WXT's `include: ../**/*`, so it also compiled `video/`, the Remotion project. Its dependencies live in `video/node_modules`, which exists on this machine but is never installed in CI, so `remotion` could not be found. The production site was not affected, since Vercel's build doesn't type-check `video/`.
- **Fix:** the root `tsconfig.json` excludes `video` (with `node_modules` and `.output`, since `exclude` replaces the inherited list). `video/` keeps its own `tsconfig`.
- **Verified:**
  - `npm run compile` passes with `video/node_modules` moved away, reproducing CI;
  - 123 tests pass;
  - the CI run for this commit is watched to the end.

---

## 2026-09-30 — Shipped: landing redesign and Sift this page are live

> "beautiful lets push and deploy"

- **What:** `site-redesign` squash-merged into `main` as one commit and pushed. Vercel deploys production (https://sift-through.vercel.app) from `main`. It carries everything in the entries below: the slat-wall hero ("Sift through companies. Talk to the right ones."), the Remotion demo video with a made-up email, the maker strip, and in the extension, the always-visible **Sift this page** button with its optional `tabs` permission.
- **Why a squash:** one branch commit briefly showed a real person's email in the demo video. Squashing keeps that commit out of `main`'s history. It still exists on the `site-redesign` branch on GitHub.
- **Verified on `main` before pushing:**
  - compile, 123 tests, `wxt build`, smoke (31) and the site build all pass;
  - no `.mov`, clean source or keys staged;
- **Live check after the push:**
  - Vercel production deploy `success`;
  - https://sift-through.vercel.app serves the new title and headline;
  - `demo.mp4` returns 200 (video/mp4, 1.8 MB) and plays;
  - no page errors.

---

## 2026-09-30 — Landing video: a made-up email instead of a blur

> "instead of blurring can we just use like a fake email like a made up one"

- **What:** the revealed address in the demo now reads `dan@usepylon.example`. `.example` is reserved (RFC 2606) and can never belong to anyone. It is drawn in Remotion over the panel in its own font (Schibsted Grotesk), colour and background, inside the camera's coordinate space, so it zooms and pans with the page. It is on screen from 11.7 s to 14.4 s of the recording.
- **Safety net:** the blur in `clean.mp4` stays under the text and now starts at 11.7 s, right at the reveal, so "Revealing…" is no longer blurred.
- **Verified:**
  - every frame from 11.4 s to 14.4 s (in recording time) in both cuts goes straight from "Revealing…" to the made-up address;
  - no frame shows the real one, including during the crossfade to the Save clip;
  - the patch matches the panel (#fcfcfc, feathered edge);
  - tests pass.

---

## 2026-09-30 — Landing video edited in Remotion (branch `site-redesign`)

> "no ant use like remotion ??"

- **What:** the demo is now an edited Remotion video (`video/`) instead of a plain trim of the recording. It runs about 18 s:
  1. an intro card ("Sift, on a real site.");
  2. the icon click, with the camera easing in on the toolbar;
  3. the Pylon result, with the camera following the panel through the score, why now and the best contact;
  4. Save;
  5. a closing card ("Sift through companies. Talk to the right ones.").

  Each moment gets a caption (a mono label and a serif line) in its own band under the picture, so captions never sit on the page's text.
- **Two compositions:** `SiftDemo` is 1600×1000 for desktop; `SiftDemoVertical` is 720×1280 and framed on the panel for phones. They are re-encoded for the web to 1.8 MB and 1.1 MB.
- **Privacy fix:** checking every frame of the reveal showed the email appears at about 11.77 s, while the earlier blur only started at 11.8 s. So the plain cut pushed in the previous commit showed the email unblurred for about one frame. The blur now starts at 11.3 s (during "Revealing…"), and every frame of 11.0–14.4 s is blurred in both new cuts.
- **Kept local:** the clean source (`video/public/clean.mp4`), renders (`video/out/`) and `node_modules` are git-ignored. `video/README.md` documents the source prep, the timeline and the render and re-encode commands.
- **Verified:**
  - stills at each moment in both sizes;
  - frame-by-frame check of the reveal;
  - the site plays each cut at 1440 and 390 px;
  - no page errors;
  - compile, 123 tests and `wxt build` pass.

---

## 2026-09-30 — Landing: real screen recording replaces the scripted demo (branch `site-redesign`)

> "can we use this for the video instead like edit or do changes on these maybe this might look better" (a 44 s screen recording of Sift on usepylon.com)

- **The edit** (15.5 s loop, no audio, made with ffmpeg):
  1. 1.0–3.9 s: the click on the Sift icon and the panel loading;
  2. a short fade across Chrome going fullscreen;
  3. 4.3–14.0 s: Pylon at 82% Strong fit, scrolling through why now, and revealing the best contact's email;
  4. 22.0–25.6 s: back at the top, Save becomes Saved.

  The Settings part (28–43 s) was left out.
- **Privacy in the edit:**
  - the revealed email of a real person (Pylon's Head of Customer Success) is blurred for as long as it is on screen;
  - Chrome's "Relaunch to update", "Ask Gemini" and a personal bookmark are painted over;
  - the macOS menu bar is cropped off;
  - the API keys never appear (Settings was cut, and they were masked anyway);
  - the raw `.mov` stays local: `*.mov` is added to `.gitignore`.
- **Two cuts:**
  - `site/public/demo.mp4`: the full window, 1600×1000, 815 KB;
  - `site/public/demo-m.mp4`: cropped to the panel for phones, 540×992, 519 KB;
  - each has a poster frame. The page picks one by screen width. It autoplays muted and loops inline; with reduced motion it shows the poster with controls instead.
- **Code:** `Demo.tsx` (the scripted demo) and its CSS are removed. The section now reads "A real lookup, recorded / One click on their homepage. *The answer beside it.*"
- **Verified:**
  - the video plays at 1440 and 390 px (readyState 4, playing);
  - frames checked for the blur and the covered buttons;
  - no page errors; reveals fire;
  - 123 tests, `wxt build` and smoke pass.

---

## 2026-09-30 — Sift this page is always there

> "no resift button ?" (screenshot: panel showing Fieldguide while the tab was on Pylon)

- **Why it was missing:** the line only appeared once the panel knew which tab its result came from. A result made before the update, or from a typed domain or My Accounts, had no recorded tab, so the panel never offered the button.
- **Fix:** every result now has a line above it, "Showing fieldguide.com", with **Sift this page**. When the active tab is no longer the result's own, the line changes to "This tab has changed. Still showing fieldguide.com." and gets stronger. Empty and not-a-company pages keep their own single button.
- **Verified:**
  - the smoke test checks both states and that there is only one button on not-a-company pages;
  - 31 smoke checks, 123 tests and the build pass;
  - screenshot `e2e/screenshots/panel-linear.png`.
- **To try it:** reload the unpacked extension at chrome://extensions.

---

## 2026-09-30 — Landing: slat cards across the whole hero (branch `site-redesign`)

> "we can have the cards all over actually and size the sift text in the cards a bit up" (their screenshot, on a shorter screen, had SIFT cut off at the bottom)

- **Layout:** the slat wall now fills the entire hero behind the copy. Cards behind the headline, lede and button (an ellipse around the copy) and under the nav are dimmed so the text stays readable.
- **SIFT sizing:** SIFT now takes the space between the copy and the bottom edge, up to 380 px tall, so it is always fully visible. It is large on tall screens and smaller on short ones instead of being cropped.
- **Verified:**
  - screenshots at 1440×900, 1528×750 (close to the user's screen) and 390 px;
  - no overflow or page errors;
  - every reveal fires;
  - `og.png` regenerated;
  - tests pass.

---

## 2026-09-30 — Landing v7: SIFT in slats, new headline (branch `site-redesign`)

> "let us remove the sifting part - lets add the large sift text down there - lets change the text to sift through the companies (work on it a bit)" and, with the MicroSlats source pasted: "i want small cards like this but no animation needed we can maybe darken the cards to spell out sift below and they flicker randomly"

- **Copy:**
  - headline "Sift through companies. / *Talk to the right ones.*";
  - lede "Open any company's site and Sift tells you if it fits, why now, and who to reach. One click, on your own Apollo and Jev keys.";
  - one Install Sift button, with "Free and open source" under it;
  - page title and share description updated to match.
- **SIFT in slats** (`site/SlatWord.tsx`, replaces the evidence canvas):
  - a full-width wall of small rounded cards fills the bottom of the first screen;
  - the cards inside the letters of SIFT are darkened, so the word reads like holes punched in a sieve;
  - random cards flicker, and about 1 in 8 flickers mint;
  - no waves and no cursor effects;
  - it is our own 2D-canvas take on the idea, no ogl and no copied code, redrawn about 16 times a second only while visible, and still under reduced motion;
  - phones use smaller cards so the letters stay readable.
- **Verified:**
  - screenshots at 1440 and 390 px;
  - every reveal fires on scroll; no overflow or page errors;
  - `og.png` regenerated;
  - compile, 123 tests, `wxt build` and smoke pass.

---

## 2026-09-30 — Landing v6: centred hero with a living evidence canvas (branch `site-redesign`)

> "no lets not use the right left design its too ai like can we think of something different". Then a pasted direction: one centred idea with very little copy, then show Sift doing it ("noise comes in, one answer comes out"). Mint should mean signal only. Kill the galaxy, the ghost wordmark and the second CTA.

- **Copy:**
  - "Know who's worth / *talking to.*";
  - "Qualify any company. Find the signal. Reach the right person.";
  - one CTA, **Install Sift** (cream), with "Bring your own Apollo + Jev keys" in small mono.
- **Evidence canvas** (`site/Evidence.tsx`), about 1100 px wide under the copy. It plays a 12.8 s loop:
  1. six pieces of evidence about Acme appear in grey (status: "reading acme.example…");
  2. the three that don't matter (the Series B at 48%, a blog offsite recap, a brand-designer opening) blur away ("sifting…");
  3. the three that do (hiring 86%, the pricing-page quote 71%, headcount 62%) turn mint and draw in, and thin mint lines join them;
  4. Ingrid Holm, VP Customer Experience, 92 (fit 90, timing 74) appears ("signal.").
- **Receipts:** hovering or focusing any piece shows its source. The loop holds while you hover, or while the canvas is off screen or the tab is hidden.
- **Other behaviour:** reduced motion shows the final answer at once. On phones the pieces stack and connect vertically. Every number comes from `demo-data.ts`.
- **Colour:** mint now means signal. The Install buttons (nav, hero, closing) are cream; the swirl and three.js are gone from the hero (fx.tsx now holds only the blinds and slats).
- **Answers section:** labelled "How Sift got there".
- **Verified:**
  - screenshots of the sequence (reading, sifting, signal, hover receipt) at 1440 px and 390 px;
  - every reveal fires on scroll; no overflow or page errors;
  - `og.png` regenerated from the final frame;
  - compile, 123 tests, `wxt build` and smoke pass.

---

## 2026-09-30 — Landing v5: product-first hero (branch `site-redesign`)

> Pasted critique: the hero had too many competing focal points (galaxy, ghost wordmark, long grey paragraph, three CTAs); "Don't sell mystery in space. Sell clarity from noise." Recommended: copy left, a real product result right, sparse dots, no ghost wordmark, one primary CTA, Privacy out of the top nav. The user: "i think we might have to use the best".

- **Left:**
  - "Know who's worth talking to.";
  - a shorter lede ("…explains why it matters now, and surfaces the best person to contact.");
  - **Install Sift** (primary) and **See the demo** (scrolls to `#demo`);
  - one quiet line: "Free and open source. Runs on your own Apollo and Jev keys, one click in your browser."
- **Right:** a condensed result card for Acme: fit 90, why now (Timing 74, with hiring 86%, moving upmarket 71%, headcount 62%), and Talk to Ingrid Holm, VP Customer Experience, 92. Every number is read from `demo-data.ts`, so it matches the real panel in the demo below. Rows arrive in the order Sift works.
- **Swirl:** now a sparse ring (1,700 dots, down from 3,400; 900 on phones), tilted face-on so it frames the card as the thing it feeds.
- **Removed:** the ghost "SIFT" wordmark, the selection point, and Privacy from the top nav (it stays in the footer).
- **Fixes:**
  - the web stub gained `tabs.onActivated/onUpdated` and `permissions.request`, because the demo renders the real panel, which now listens for tab switches;
  - the avatar initials had inherited the job-title style.
- **Verified:**
  - screenshots at 1440 and 390 px;
  - every reveal fires on scroll;
  - no overflow or page errors; reduced motion OK;
  - `og.png` regenerated (headline and card);
  - compile, 123 tests, `wxt build` and smoke pass.
- **Note:** the round widget at the right edge of the user's screenshots comes from a browser extension on their machine, not from the site.

---

## 2026-09-30 — Sift this page: re-sift after switching tabs

> "we need a refresh button like once i switch to different site with the panel open i need to have a button the re-sifts if it doesnt"

- **What:**
  - when the active tab is no longer the one the panel's result came from (you switched tabs, or that tab loaded another page), a line appears under the credit bar: "This tab has changed. Still showing gorgias.com." with **Sift this page**;
  - the same button is on the empty, not-a-company and LinkedIn-feed states.
- **Why a permission:**
  - Chrome only gives an extension a tab's address after its icon or shortcut is used, and a click inside the side panel doesn't count;
  - so the button asks once for the optional `tabs` permission, inside the click, then reads the active tab's address only at that moment;
  - it is not requested at install, and switching tabs only compares tab ids, which need no permission;
  - if you decline, the panel says to use the icon or Alt+Shift+S.
- **Limit:** lookups started from the button can't scan the website (that needs the icon's grant), so website signals show as unavailable for uncached companies. Apollo data, fit, hiring, headcount, funding and contacts all work.
- **How:**
  - the background records the source tab on every sift (`setViewTab`);
  - `useTabSwitched` in `src/components/SiftThisPage.tsx` compares it with the active tab;
  - a new `siftTab` message reuses the icon-click path (`siftTab()` in background);
  - PRIVACY, README, SPEC, the store listing and the landing privacy line are updated.
- **Verified:**
  - compile and 123 tests pass;
  - `wxt build`: the manifest lists `tabs` only under `optional_permissions`;
  - smoke now has 30 checks: the bar appears when the result's tab isn't the active one, disappears when it is, and "Sift this page" shows on pages Sift can't use;
  - not verified: the Chrome permission prompt itself (headless Chromium can't show it). Worth one manual try: click Sift on a site, switch tabs, press Sift this page, allow.

---

## 2026-09-30 — Landing: wordmark behind the headline (branch `site-redesign`)

> "can we have the sift word below the swirl like behind the hero text - know who's worth talking part"

- **What changed:** the outline "SIFT" moved out of the vortex into the hero copy. It is centred on the headline and sits behind it (z-index -1 inside the copy). The swirl is now clear above it, and the letters' top edge just meets the swirl's lower rim.
- **Verified:**
  - screenshots at 1440 and 390 px (the text stays legible over the 16% stroke);
  - no overflow or page errors;
  - `og.png` regenerated;
  - tests pass.

---

## 2026-09-30 — Landing: portfolio and email in the maker strip (branch `site-redesign`)

> "add my portfolio in the contact part and this along with my email"

- **Maker strip:**
  - now reads "Made by Aditya Venkatesan" (name from the portfolio);
  - shows the email as a mono link;
  - buttons: Portfolio (https://aditya-venkatesan-gtm.vercel.app/, mint, primary), Email me (mailto), GitHub.
- **Footer:** "Report an issue" moved into the Project column.
- **Verified:**
  - screenshots of the strip at 1440 and 390 px;
  - no overflow or page errors;
  - compile and tests pass.

---

## 2026-09-30 — Landing v4.2: outline wordmark behind the swirl (branch `site-redesign`)

> "can we incorporate this part into the hero section somehow i really like it" (the outline SIFT wordmark from v3)

- **What changed:** the giant outline "SIFT" (1 px mint stroke at 16%) is back. It sits behind the vortex, centred on the selection point (the same `--vy` the canvas uses), so the particles sweep across the letters. The layers, back to front: wordmark, canvas, selection point. On phones it is 36vw wide.
- **Verified:**
  - screenshots at 1440 and 390 px;
  - no overflow or page errors;
  - `og.png` regenerated;
  - tests pass.

---

## 2026-09-30 — Landing v4.1: quieter hero, maker strip in the footer (branch `site-redesign`)

> "i dont want those lines/callouts at all - and i am not sure about the center logo also itd be cool to know that i have created this so a contact part at the footer would be cool as well"

- **Hero:**
  - removed the two annotation lines;
  - replaced the boxed app icon with a glowing selection point that slowly breathes, so the picture no longer looks pasted on;
  - the swirl now has a clear hierarchy: faint loose dust, medium dots on the arms, and the few selected dots mint, about twice the size and fully bright, orbiting tight around the point;
  - about 35% fewer particles (3,400 desktop, 1,500 mobile).
- **Footer:** a "Made by" strip above the links with the GitHub avatar, handle, one line ("A GTM engineer building Sift in the open…"), and buttons to the GitHub profile and to open an issue. No email is published.
- **Verified:**
  - screenshots at 1440 and 390 px;
  - no overflow or page errors;
  - every reveal fires on a real wheel scroll (the old QA script jumped past the new strip);
  - `og.png` regenerated;
  - 123 tests, `wxt build` and smoke (28) pass.

---

## 2026-09-30 — Landing page v4: our own look (branch `site-redesign`, preview only)

> "i like the style but it feels like we straight up ripped off we need to add our own twist … i dont necessarily want so much cursor action … we can have the 3js swirl as the main part not so small on the top … the text with the beautiful sift embed … bigger and more in the center"

- **Hero is the swirl** (`site/fx.tsx`, replaces `SiftField.tsx`). Sifting as panning for gold:
  - thousands of dots ride three spiral arms in towards the Sift mark;
  - most flash and are flung back over the rim, and about 1 in 12 turns mint and settles into a ring around the mark;
  - it is big and centred, with two hand-set notes ("every company you visit", "the few worth your time");
  - the headline, lede and buttons sit under it; the chips, result pill, stats and outline wordmark are gone.
- **No cursor effects anywhere.** The pictures move on their own.
- **Meridian signatures removed and replaced with a sieve motif:**
  - the framed card with dot corners → a full-bleed night hero;
  - the glass pill nav → a full-width bar with a mint scroll-progress line;
  - numbered chips → a sieve glyph, the question, and the score the card beside it shows (90, 74, 92, 88, matching the demo data);
  - flat tinted blocks → slatted stages;
  - tinted cost cards → a receipt with dotted leaders and "Sift's own fee: 0";
  - the privacy band sits behind closed blinds (a shader), and the closing and footer are one night block over a rolling sea of slats instead of a giant wordmark.
- **Shaders:** the React Bits components the user shared (GradientBlinds, MicroSlats) were ideas only. The blinds and slats are our own small three.js shaders: no `ogl` dependency, and no Commons Clause code in an MIT repo. All three share one lifecycle: they draw only while on screen, pause in hidden tabs and hold a still frame under reduced motion.
- **Verified:**
  - Playwright at 1440 and 390 px, screenshots reviewed (fixed the dark-on-dark closing headline, too-bright blinds light, a small mobile swirl, and note legibility over the arms);
  - no overflow, no page errors, reveals fire, content visible under reduced motion, card hover lift -4 px;
  - `og.png` regenerated;
  - compile, 123 tests, `wxt build` and smoke (28) pass.

---

## 2026-09-30 — Landing page v3: centred funnel hero, Meridian-style sections (branch `site-redesign`, preview only)

> "this part makes little sense - id like to have the hero section text alligned tpo thew center with the particle funekling in the middle - also it looks pretty bland and boring … the header and footer are lackluster https://meridian-ind.vercel.app/"

- **Research (Playwright):** Meridian closely (framed deep-green hero card, dot-grid corners, floating glass pill nav, serif headings with mono labels, numbered sections, tinted cards, a giant cropped wordmark), plus Attio, Clay, Wispr, incident.io, Linear and Polar.
- **Hero:**
  - a framed dark card with dot-grid corners;
  - example domains at the top fall into a centred funnel onto the Sift mark (`SiftField.tsx` rewritten). About 1 in 13 dots pass, turn mint and stream into a result pill: "Ingrid Holm, VP Customer Experience 92";
  - centred copy in Instrument Serif, mono eyebrow, mint and glass buttons, a stats row (1 click, 4 answers, 0 servers, 2 credits) and an outline "SIFT" wordmark.
- **Nav:** a floating glass pill (blur, border, depth) that tightens on scroll.
- **Scroll story replaced.** The iframe story didn't read well. It is now four numbered answers (01 fit, 02 why now, 03 who to email, 04 LinkedIn), each beside a tinted stage holding the *real* panel component (`FitCard`, `WhyNowCard`, `ContactPicker`, `ProfileCard`, now exported from `App.tsx`; nothing else changed). The panel iframe files are removed.
- **Also:**
  - "After the click" as dark and light tiles;
  - costs on tinted cards;
  - privacy as a full-bleed night band;
  - a dark closing card with the field;
  - a new footer with three link columns (including the changelog) and a giant gradient "SIFT" wordmark.
- **Fonts:** Instrument Serif and JetBrains Mono (self-hosted via fontsource).
- **Verified:**
  - Playwright QA: every reveal fires, the nav scrolled state works, no horizontal overflow at 390 px, content visible under reduced motion, card hover lift -4 px, no page errors;
  - screenshots reviewed (fixed the footer wordmark letters colliding and the result pill width on mobile);
  - `og.png` regenerated from the new hero;
  - `npm run compile`, 123 tests, `wxt build`, and smoke (28 checks) pass.
  - The no-slop-motion linter flags 10 soft shadows. They are kept on purpose: layered white cards on tinted stages and the glass nav are the Meridian depth the user asked for.

---

## 2026-09-30 — Landing page redesign (branch `site-redesign`, preview only)

> "can we make the site atleast a bit better this is super bland lets give it some life … visit multiple yc company landing pages … u can use three js"

- **Research (Playwright):** Resend, Raycast, Supabase, Loops and PostHog. Hero screenshots, whole-page strips, fonts, WebGL/video use, animation counts, and hero motion measured (idle vs. mouse: Raycast 17% / 12%, Resend 4% / 5%). All five have fixed navs.
  - **Patterns taken:** one moving hero object beside a calm, huge headline (Resend, Raycast); the product big and early (Loops, Raycast); short punchy section heads; a story that ends on the opening promise.
- **Hero: "sifting", in three.js** (`site/SiftField.tsx`).
  - A polar-night field: dots fall onto a shimmering dotted sieve. Most flash and scatter; about 1 in 14 passes, turns the mark's teal, and funnels into a stream that lands where the Sift panel opens in the demo below.
  - The pointer parts the dots.
  - All motion runs in one vertex shader (61 fps even on headless software GL). It pauses off-screen and in hidden tabs, is static under reduced motion, and is loaded after first paint (page script 11 KB gz; three.js 133 KB gz separately).
- **Copy:** "Know who's worth talking to." (the user's line), a solid Install button, and "See how it works".
- **Structure:**
  - the demo straddling night and day;
  - **"One click. Four answers."**, a scroll story where the *real* side panel (an iframe, `site/panel.html`) follows the step being read: fit → why now (scrolls to the signals) → who (contacts, email revealed) → LinkedIn ("On this profile");
  - "And after the click" (My Accounts, Discover, Who to look for);
  - **costs** as big counting numbers (2 / 0 / 1 / 1);
  - **privacy** as a diagram (your browser → Apollo and TypeSafe, no Sift server);
  - FAQ;
  - a dark closing band with the field again.
- **Header:** dark over the hero, then light and blurred.
- **Design note:** this departs on purpose from the extension's all-white, lines-only system (dark bands, a solid pill button) because the user asked for more life. The extension UI is unchanged.
- **Verified in Playwright:** field renders and moves; header switches; each story step switches the embedded panel (scroll positions 0 / 397 / 537, profile card on LinkedIn); counts reach 2 / 0 / 1 / 1; no errors; no horizontal overflow at 390px; reduced motion is fully still. Slop linter clean on `site/`. Extension tests, tsc and build unaffected.
- **Fixed during review:** the closing headline was dark-on-dark (base `h2` colour); "TypeSafe" overflowed its circle; the sieve sat behind the paragraph under the headline (narrowed and moved right); "to." widowed (balanced wrap).

---

## 2026-09-30 — Site address is now sift-through.vercel.app

- The Vercel project's production domain was renamed in the dashboard from `sift-rosy-omega.vercel.app` to **`sift-through.vercel.app`**. The old address now returns `DEPLOYMENT_NOT_FOUND`.
- Updated the social-preview and canonical tags (`site/index.html`) and the README link to the new address.
- Auto-deploy was delayed, not broken. The Git link was healthy (repo connected, branch `main`, deployments enabled). `b196b0a` deployed about 2 minutes after the push and covers the LinkedIn commit `cbee0ef`, which Vercel skipped as superseded. Verified live: the new `og:url` and the landing FAQ's LinkedIn answer.

---

## 2026-09-30 — LinkedIn profiles

> "yes build linkedin support"

- **Click Sift on a LinkedIn profile.** It sends only the address to Apollo's `people/match` (`linkedin_url`), which returns the person (title, **LinkedIn headline**, verified email) and their company's domain. The normal lookup then runs on that company, with the person ranked among the others.
  - Costs 1 credit for the person (their email included), plus the company lookup if it's new.
  - The match is cached 30 days, so a revisit is free.
- **Panel:** an **On this profile** block comes first: name, headline, rank bar, "Ranks N of M here", email with Copy. Other LinkedIn pages get "Open a person's profile". A profile with no company shows the person and their email.
- **Plumbing:**
  - `linkedinProfile()` / `isLinkedin()` in the resolver; `matchLinkedin()` / `mapProfileMatch()` in the Apollo client.
  - `runProfileLookup()`, plus a `focus` option on `runLookup`. The lookup message carries `profileUrl` for Refresh and "Look up anyway".
  - `withFocus()` merges the person into the contacts; `peopleState` passes headlines to Jev.
  - Cached and saved copies don't keep the profile marker.
- **No new permissions:** the icon click's `activeTab` already gives the address. LinkedIn's page content is never read. PRIVACY.md, the store listing, the README, Settings' cost note and the landing page (FAQ now "Yes, on people's profiles"; cost row added) are updated.
- **Tests:**
  - profile URL parsing (tracking query strings, country subdomains, non-profile pages, look-alike domains);
  - `mapProfileMatch` on Apollo's real response shape; `withFocus`;
  - the flow with mocks: first visit 1 credit (email saved, person ranked into the cached company, cache copy unmarked), revisit free, unknown profile, no company, budget.
  - 123 pass. Smoke adds "On this profile … Ranks 2 of 8" and the LinkedIn guidance.
- **Live, end to end (3 credits):** Cristina Cordova's profile → Linear lookup in 3.5s; she's #1 of 25 (66), Skyline Lau second, Alexandra third. The revisit was free and instant.

---

## 2026-09-29 — Finding the owner at small companies (Linear)

User screenshot: Sift on Linear listed "Jon P., Customer Experience" as best contact (3 found), while LinkedIn showed Skyline Lau, *Customer Experience Leader*, and Alexandra, *Product Operations Lead (Customer Experience & ProdOps)*.

- **Probe (free people search):** Apollo has both.
  - Skyline is found by the keyword "customer experience" at any level.
  - Alexandra's Apollo title is just "Product Operations Lead", so only "operations" finds her.
  - The Ramp fix only searched keywords among *senior* people. Linear (180 people) has no VP or Head for CX; its owners are Leads and Managers.
- **Search:** a fourth tier, each keyword at any level. Senior results still come first; the any-level searches **take turns** (`interleave`), so the first keyword's 15 reps can't fill the list before "operations" gets a say. Cap 25 → 30.
- **Ranking:** new `eval/rank-eval.mjs` (14 ordered pairs of real titles). The plain wording scored 10/14: it put "Customer Experience" (a rep) above "Customer Experience Manager" and above the COO. The level-aware wording (leads and managers outrank members; a bare function title usually means an individual contributor) scored 13/14; the only miss is a near-tie at the bottom. Shipped.
- **Live, default settings:**
  - Linear: 3 → 22 found; up front Cristina Cordova (COO, 70) + Skyline Lau (Customer Experience Leader, 66).
  - With the keyword "operations": Skyline first (78), Alexandra #3.
  - Ramp: Elena, Head of Customer Operations, first (77), then CX managers and Customer Success heads.
- **Tests:** `findPeople` searches in order (senior, then any level), turn-taking merge, exclusions; `interleave`. 106 pass.
- **Note:** cached results keep their old contacts until *Refresh* (or until a profile save clears the cache).

---

## 2026-09-29 — Demo directed with no-slop-motion's rules

> "https://github.com/ferndesk/no-slop-motion - can u use for the demo"

That repo is an agent skill for making launch *films* (MP4): ten sign-off gates, Cartesia voice, Suno music, HyperFrames render. Our demo is a live loop of the real panel, so we used its **motion rules and its slop linter**, not the film pipeline.

- **Actions finish:** a cursor travels to the Sift icon and presses it before the panel opens, and presses "Reveal email" before the email appears. Targets are measured from the DOM every loop.
- **No hard pops:** every part of the panel (credit bar, header, fit, why now, persona, contacts, email) rises in as the lookup produces it. Checks, signals and contacts arrive one by one. The fit strip fills left to right as the first "hit", followed by 1.5s of air.
- **One idea at a time:** the fake page dims to 40% while the panel works.
- **Eases:** power3.out for arrivals, power2.inOut for the cursor, power2.in for exits; the panel opens on expo.out. No linear moves, no overshoot.
- **Type:** the headline enters blur to sharp (14px → 0, y 24 → 0); the lines under it rise after it in order.
- **Robustness:** the loop pauses while the tab is hidden. With reduced motion there's no cursor and no animation, just the finished panel. All motion styles are scoped to the demo; the extension itself is unchanged.
- **Linter** (`scripts/qa/lint-slop.ts` from the repo, run on `site/` and `src/`): it found the pulsing glow ring on the demo's icon (removed; the cursor click replaces it) and the field focus line drawn with `box-shadow` (now a 2px border). Both now report 0 errors and 0 warnings.
- **Bug caught by the click check:** the icon's pressed look was added to the element directly, and React's re-render in the same moment wiped it, so the click never showed. It's now React state.
- **Verified:**
  - both presses land (cursor tip inside the icon and inside "Reveal email" at the moment of pressing), on desktop and at 390px;
  - a 28-frame contact sheet of one loop reviewed;
  - the fit block's entrance animation is running;
  - reduced motion shows the final panel with the cursor hidden;
  - no page errors, no horizontal overflow.

---

## 2026-09-29 — Site redeployed; auto-deploy from GitHub

- Production redeployed with full-URL `og:image`, `og:url` and canonical tags, checked on the live page (`og.png` served as `image/png`).
- The GitHub repo `Aditya-v05/extens` is connected to the Vercel project `sift` (it was already connected when `vercel link` set up the project). **Every push to `main` now deploys the site to production.** Pull requests and other branches get preview URLs.

---

## 2026-09-29 — Landing page (Vercel)

> "lets host in vercel - yes install form guithub with coming soon - i think a looping animatio maybe"

- **`site/`:** a one-page site, built with Vite and deployed by Vercel (`vercel.json`: `npm run site:build` → `site/dist`).
- **The demo is the real side panel.** `site/vite.config.ts` swaps `wxt/browser` for `site/browser-stub.ts` (in-memory storage with change events, no-op messaging), so the extension's own `App` renders on a normal page.
  - `Demo.tsx` loops through a lookup: the icon pulses, the panel slides in, then company, fit (while why-now is still loading), why now, and contacts. It scrolls to the contacts, reveals an email, closes, and repeats.
  - It pauses while the tab is hidden, and shows the finished state with no motion when reduced motion is on.
  - The demo can't drift from the product because it *is* the product.
- **Demo data is fictional:** "Acme" at `acme.example` (a reserved domain) with made-up people. The fit score is computed by Sift's own `combineFit`: 4 of 4 met, overall 78 → 90.
- **Page:**
  - hero with *Install from GitHub*, *Read the source*, and "Chrome Web Store: coming soon";
  - what the panel answers (fit, why now, who), and what comes after the click (My Accounts, Discover);
  - "It costs what it says" (the credit table);
  - "Your keys, your browser";
  - FAQ, including honest "not yet" answers for LinkedIn and phone numbers.
  - Same design system as the extension, no emoji, lines only; stacks on phones with no horizontal scroll.
- **Assets:** a social image (`site/public/og.png`, 1200×630, rendered from the page) and a favicon. Icons are imported rather than copied, so the extension zip didn't grow.
- **Tooling:** `npm run site:dev` / `site:build`; `compile` also type-checks the site (against the real extension types). CI builds the site too.
- **Bug fixed in the extension, found by the demo:** the side panel read its state *then* subscribed to changes, so a change landing in between was lost. In the extension, a background write at that moment would leave the panel stale until the next update. It now subscribes first and only uses the initial read if nothing arrived meanwhile.
- **Rejected:** `@vercel/config` (for a `vercel.ts`) brought 3 high-severity advisories through `path-to-regexp`, with only an old-version downgrade as a fix. A plain `vercel.json` needs no dependency; still 0 vulnerabilities.
- **Verified:**
  - desktop and 390px phone screenshots, six animation frames reviewed, no console errors, no horizontal overflow;
  - reduced-motion mode shows the finished panel;
  - extension unit tests, tsc (extension and site), build, and smoke still pass.
- **Deployed** to https://sift-rosy-omega.vercel.app (Vercel project `sift`), after the user ran `npx vercel login`. The CLI was asked for a preview, but Vercel sends a project's first deployment to production. The social image and canonical links now use the full URL.

---

## 2026-09-29 — Ready to share: CI, store kit, shortcut, v0.2.0

- **Phones are parked.** The user's Apollo account has 0 of 2,500 direct-dial (phone) credits left this cycle, and phone reveals need a webhook relay, i.e. a backend.
- **CI** (`.github/workflows/ci.yml`): on every push and PR it runs type-check, unit tests, build, then Playwright's Chromium and the smoke test, and uploads the screenshots. No API keys; the live tests skip themselves.
- **Chrome Web Store kit:**
  - `PRIVACY.md`: what's stored locally, what goes to Apollo and TypeSafe, website access only on click, no Sift server.
  - `store/listing.md`: name, 132-character summary, description, single purpose, a justification for each permission, data disclosures, privacy policy URL.
  - `npm run store-shots` (`e2e/store-shots.mjs`) renders the real built extension with sample data: 3 panel shots (fit, contacts, why now) beside a short headline, My Accounts, Discover, and a 440×280 promo tile with the icon. Each panel shot shows one part of the panel.
- **Keyboard shortcut:** `_execute_action` at Alt+Shift+S (⌥⇧S on a Mac). It works like clicking the icon, including the one-tab access. The panel's empty state mentions it.
- **Version 0.2.0**, `engines.node >= 22`, `npm run zip` for the upload package.
- README: CI badge, shortcut, privacy link, install section, the new scripts.

**Verified:** 105 unit tests, tsc, build, smoke 26/26, zip built, store images reviewed. The first CI run on GitHub passed every step in 1m27s. The actions were then bumped from v4 to v7, since v4 targets the deprecated Node 20.

---

## 2026-09-29 — "Who to look for": the people filters, in Settings

> "should we maybe just uhm recreate the apollo filters ?"

Not the whole Apollo panel; only what its API actually honours.

- **Probed at Ramp (free):**
  - titles and seniorities work; keywords work;
  - `include_similar_titles` returned nothing;
  - department filters returned nothing (with the parameter name tried; it isn't documented);
  - `person_not_titles` was ignored.
  - Copying Apollo's filter UI would have shown controls that silently do nothing.
- **Settings → What you sell → Who to look for** (prefilled from the personas, saved with the profile):
  - **Titles:** the personas.
  - **Seniority:** Apollo's 10 levels as checkboxes; default owner…director; none checked = any level.
  - **Keywords:** one word each; default the personas' function words; the first 5 are searched.
  - **Leave out titles containing:** applied by Sift, whole words, any case.
- **Data:** `Rules` gains optional `seniorities`, `keywords`, `excludeTitles`. `peopleFilters()` fills defaults, so older profiles work unchanged, and `generateRules` sets them for new ones.
- **Search:** `findPeople` takes these filters: titles at the chosen seniorities, one search per keyword, titles at any level, merged senior-first, exclusions dropped, up to 25. With no seniority checked it doesn't repeat the title search.
- **Settings also** counts Discover searches in "Spent by Sift this month".
- **Tests:**
  - defaults for old profiles; whole-word exclusion ("Internal" isn't "intern");
  - `findPeople` sends the exact searches in order, puts senior people first, drops exclusions, handles any-level and fallback;
  - `generateRules` fills the new fields.
  - 105 unit tests pass. Smoke adds: 7 seniorities checked by default, titles and keywords from the personas, and adding "operations" + unticking Partner is saved. 26/26 pass.

---

## 2026-09-29 — Finding the real owner (Ramp)

> "is there no better cx head in ramp ?"

There was. Sift never saw her.

- **Cause:** people search matched the persona titles with no seniority filter and took the first 15. At Ramp that returned 15 of 23 customer-experience reps, and Jev could only rank who it was given, so "Waylon L., Customer Experience" came out on top. Ramp's **Head of Customer Operations** (Elena G.) never appeared, because her title doesn't contain the persona phrases.
- **Probing Ramp with the free search:**
  - the persona titles among senior people: 0 results;
  - the phrase "customer experience" among senior people: 0 results;
  - the word "customer" among senior people: Elena plus a Director and three Heads of Customer Success.
- **Fix** (`findPeople`, `src/lib/people.ts`): three free searches in parallel, merged senior-first, up to 25.
  1. The persona titles among senior people.
  2. Senior people matching each single function word from the personas ("customer", "experience", "support").
  3. The persona titles at any level, to fill in.
- **Ranking** now runs in batches of 10 (`rankPeople`), the same lesson as the role judgments: long lists blur Jev's answers.
- **Result at Ramp (live, 1 credit for the company lookup):** 20 people found in 0.9s and ranked in 0.4s. Elena, Head of Customer Operations, is first at 62, ahead of the CX reps (44–49).
- **Guard:** while testing, a search with an empty company id came back with 333,230 people from other companies (IKEA, banks…). Apollo silently drops the filter. `searchPeople` now refuses to run without a company id; there's a test for it. Real lookups always have an id; this was a test-harness mistake, but the failure would have been silent.
- **Tests:** `people.test.ts` (function words, merge order and cap) and `people-guard.test.ts`. 99 pass.

---

## 2026-09-29 — Discover: companies like your best saved accounts

- **Apollo findings:**
  - `mixed_companies/search` takes `lookalike_organization_ids` (max 5) and costs 1 credit per page of up to 100.
  - Results carry name, domain, logo, founding year, revenue and headcount growth, but no industry, headcount or description.
  - The user's new **master key** works for `credit_usage_stats` (425 of 2,525 lead credits left, resets Oct 7), so the credit bar can show the real balance once it's pasted into Settings. The key isn't stored anywhere in the repo.
- **Discover tab** in My Accounts:
  - Seeds = top 5 saved accounts by priority, skipping "Not a fit", named before anything is spent.
  - The ICP's headcount and country rules become search filters; saved, viewed, dismissed and seed domains are excluded.
  - 50 suggestions for 1 credit, in Apollo's similarity order, each with founding year, revenue and 12-month headcount growth.
  - *Look up (2 cr)* runs a full lookup, after which the row shows fit, timing and priority plus *Save*. *Dismiss* hides a suggestion and keeps it out of future searches.
  - *Load 50 more* / *Search again* cost 1 each. An unchanged search is reused for 7 days, and opening the tab never spends.
- **Ledger:** gains a `search` kind; old ledgers without it still add up.
- **Bug found by the smoke test:** chrome.storage returns objects with sorted keys (`{max, min}`), so a search key made from stored rules didn't match one made from fresh rules. That could have made a cached search look stale and asked for another paid search. `searchKey` now uses plain arrays, with a test for it.
- **Tests:**
  - `discover.test.ts`: query building, labels, key stability including storage key order, seed choice, both response shapes, merging.
  - `discover-run.test.ts`: 1 credit per page, repeats free, "more" loads page 2 without duplicates, no seeds, budget, dismissed exclusion.
  - Smoke: seeds shown, similarity order, look-up cost shown, Dismiss remembered, no boxes. 23/23 pass.
- **Live:** real Discover with the master key returned 403 lookalikes of Gorgias (50–500 employees, US), 49 new on page 1, in 1.4s, recorded as exactly 1 `search` credit.

---

## 2026-09-29 — Contacts: best up front, the rest inside the panel, reveal all

> "the drop down should be limited to the extension panel - and we should have the best contatc out first and the other contacts are in a dropdown - what happens if there are two very good contacts do both of them show up - and there should be a button to enrich all of them at one go"

- **Dropdown escaping the panel:** a native `<select>` menu is drawn by the OS and spilled over the page. Replaced by "Show N more contacts", which expands inside the panel as two-line rows (name and title; rank and *Reveal (1 cr)* on the right).
- **Two very good contacts:** now both show. Up front = the best, plus anyone within 10 rank points of them who ranks at least 60 and has an email, up to 3 (`splitContacts`, `src/lib/contacts.ts`). Before, only the single best showed.
- **Reveal all:** *Reveal all N emails (N credits)* asks inline first, states the cost ("you're only charged for people Apollo finds"), and warns in red if it would pass the monthly budget. Afterwards it reports e.g. "Revealed 5 emails. 1 had no email in Apollo."
- **`revealContacts`** (`src/lib/pipeline.ts`) replaces the single reveal. The `reveal` message takes `personIds`.
  - Runs 3 Apollo requests at a time and records credits only for people found.
  - Updates the cache, saved account and open panel in one write each. Revealing one at a time in parallel would have lost updates to read-modify-write races.
  - Failed people stay unrevealed, so they can be retried.
- **Tests:**
  - `contacts.test.ts`: near-ties, the cap of 3, the minimum rank, no-email people, the multi-reveal patch.
  - `reveal.test.ts`: at most 3 in flight, charges 6 of 8 (not-found and failed aren't charged), exactly one write per copy, failures stay retryable.
  - Smoke test on a 8-contact sample: both near-tied contacts shown, the rest collapsed then expanded, the list stays within the 400px panel, no `<select>`, Reveal all asks with the cost. 18/18 pass.

---

## 2026-09-29 — Renamed to Sift; contacts dropdown; icon

> "all the emails getting listed like this is not efficient a drop down is good … lets rename it to sift … the icon as well"

- **Name:** ICP Scout → **Sift**: manifest (`Sift`, action title "Sift this company"), page titles, UI copy, README, SPEC, LICENSE, package name, and the CSV file name (`sift-accounts-<date>.csv`). Earlier log entries keep the old name as history. The GitHub repo is still `extens`.
- **Icon:** from the user's design, exported to `public/icon/{16,32,48,96,128}.png`, which WXT adds to the manifest.
  - The off-white rounded square is kept so the navy mark stays visible on dark Chrome toolbars (the user's theme is dark); the corners outside the square are transparent.
  - 16px and 32px are redrawn with the mark filling more of the square so it stays legible.
  - The README shows the icon.
- **Contacts:** one at a time instead of a stack of cards.
  - New `ContactPicker` shows the selected person (name, title, rank, email or *Reveal email (1 credit)*, LinkedIn) under an accent line.
  - A dropdown lists everyone in rank order, marked "(email ready)" or "(no email)", with "1 of N" beside the heading.
  - A new lookup resets to the best match.
  - Used in both the side panel and My Accounts (which previously listed the top 6).
- **Cleanup:** the contact-card code in the panel and the contact list in My Accounts are gone; the picker's styles moved to the shared stylesheet so both pages get them.
- **Smoke test:** new checks that pages are named Sift, the panel shows one contact at a time, the dropdown lists everyone best first, and choosing someone shows them. 15/15 pass.

---

## 2026-09-29 — Lines only, no boxes

> "lets not have boxes at all just use lines"

- **Buttons** are underlined text actions. The main action on a view gets a heavier 2px underline; secondary actions are stone grey and underline on hover.
- **Fields** (inputs, textareas, selects) have a single bottom line that turns fjord blue on focus.
- **Sections** (settings, `.card`) are separated by a top hairline and space, with no border box.
- **Side panel contacts** are rows between hairlines, and the best contact sits under a 2px accent line. The Reveal email action is left-aligned text instead of a full-width button.
- **Tags** ("Warm", "verified", "Partial fit") are coloured words, no tag shape. Notices use a coloured left line.
- **My Accounts:**
  - Priority is a plain coloured number (was a tinted square).
  - An expanded row is marked by a dashed divider (was a grey background).
  - Tabs are underlined words; the logo placeholder is a plain letter.
- **Emails** use the normal typeface instead of monospace.
- **Smoke test:** a new check fails if any element on the panel, My Accounts or Settings has a border on all four sides (checkboxes excepted). 11/11 pass.

---

## 2026-09-29 — Fit score follows your requirements; white Scandinavian UI

First feedback from using the real extension:

> "no emoji emojis suck - use white scandinavian styel for the ui - also you told its a strong fit but its a partial fit with 53% but 3 of my requiremtnes are met"

### Fit score
- **Problem:** the headline was only Jev's holistic judgment. The checklist sat beside it but never counted. Real Gorgias lookup: 3 ticks, "53%, Partial fit". Two details made it worse:
  - 520 employees against a 500 cap was a hard fail.
  - "Large support teams" at p = 0.50 showed as a tick although Jev couldn't tell.
- **Now:**
  - Each check has a **state** (met / near miss / unsure / not met / no data) and a **credit**.
  - Near miss = headcount within 10% outside a limit, worth 0.5.
  - Unsure = Jev 0.35–0.65.
  - Score = **75% requirements + 25% overall judgment** (`combineFit` in `src/lib/mapping.ts`).
- **Gorgias:** 53 → **69**, shown as "2 of 4 met, 1 near miss, 1 unsure. Overall judgment 53."
- **Old results** (cache, saved accounts, an open panel) are rebuilt on display by `upgradeFit`.
  - The old linear.app result goes 35 → 69, since it meets 3 of 4.
  - My Accounts re-ranks to Linear 68, Gorgias 59, Intercom 49.
- **Correction:** my earlier "gorgias.com: strong fit" came from the made-up sample data used for screenshots (82%), not a real lookup. The sample data now mirrors the real Gorgias result.

### Design
- **No emoji or symbol glyphs anywhere.**
  - Signal icons are gone.
  - ✓/✗ became thin SVG line icons, one per state (`src/components/Icon.tsx`).
  - Star Save is now a Save / Saved button.
  - Arrows after links are gone, middle-dot separators became commas or parentheses, and the settings sections lost their numbers.
- **White Scandinavian look** (`src/components/styles.css`):
  - Palette: white, birch surface, frost hairlines, granite text, one fjord-blue accent, and muted moss / ochre / lingon for status.
  - Always light, even in OS dark mode.
  - Font: Schibsted Grotesk (Norwegian), bundled with the extension, so nothing is fetched.
  - Sentence-case headings; sections separated by space and hairlines instead of stacked cards.
- **The one loud element:** a large, light fit number with a **requirement strip** under it, one segment per check coloured by state.
- **Fixed:** the credit bar never drew on My Accounts (its styles only lived in the panel's CSS).

**Verified:**
- 79 unit tests, including the real Gorgias case, near-miss bounds, and upgrading old results.
- `npm run smoke` 8/8. New checks: the panel stays white with the OS in dark mode, no emoji or symbol glyphs in the panel, and the new ranking.
- Screenshots reviewed for the panel, My Accounts and Settings.

---

## 2026-09-29 — My Accounts

A full-page list of saved and recently viewed companies. Ranked, filterable, with status and notes.

- **Page** (`src/entrypoints/accounts/`): opened from the side-panel footer and Settings (Settings section 4 replaces the old saved table).
  - **Tabs:** Saved / Recently viewed. Recently viewed = cached lookups from the last 7 days, with ☆ Save.
  - **Priority** = 60% fit + 40% timing (`src/lib/accounts.ts`). Sort by priority, fit, timing or recently saved.
  - **Row:** fit, why-now label + top signal, best contact, status dropdown (New / Contacted / Replied / Not a fit), last updated (stale after 14 days), *Refresh · 2 cr*, *Remove*.
  - **Expanded row:** fit checklist, every signal with sources, top 6 contacts with *Reveal · 1 cr*, a note.
  - **Filters:** search (across company, note, persona, all contact titles, signal labels and details), status, "Hot only".
  - Stacks into cards in narrow windows.
- **Data:**
  - Status and notes live in `accountMeta`, separate from the snapshot, so they survive refreshes and unsave/re-save.
  - A successful lookup of a saved company now updates its saved copy, keeping the original `savedAt`.
  - The list prefers the newer of the saved snapshot and the cache.
- **Headless refresh:** `runLookup` accepts `windowId: null` and returns the final state. The background handles `refreshAccount` and the page asks before going over budget. `revealContact` also works without a panel.
- **CSV:** moved to My Accounts; adds `status` and `note` columns.
- **UI smoke test** (`e2e/smoke.mjs`, `npm run smoke`): loads the *built* extension into Playwright's Chromium, seeds sample data (no API calls), checks ranking, status saving, search, the tabs, the side panel and page errors, and screenshots every page.
  - This was the first time the UI ran in a real browser. It found: search missing contact titles and signal details (fixed); link buttons centred instead of left-aligned (fixed); awkward contact-line wrapping (fixed); a cramped search box in narrow windows (fixed).
- **Real-extension check:** clicked *Refresh* on a saved account in real Chromium with the real keys. It took 1.8s, recorded exactly 2 credits (company 1, jobs 1), kept status, note and `savedAt`, and threw no errors. This is the first confirmation that Apollo and Jev work from inside the actual extension, not just from Node.

**Verified:** 74 unit tests (new: priority, stale flag, row building, sort/filter; storage tests for savedAt, metadata surviving unsave, and no lost concurrent credit spends); tsc and build clean; smoke test 6/6.

---

## 2026-09-29 — Website signals (v2)

Why now now also reads the company's own website. Rule: every signal quotes the page and links to it.

- **No new install warning.** An icon click gives `activeTab`. With the new `scripting` permission, `scanSite` runs inside that tab and fetches the same site's pricing, blog, changelog and security pages (it runs with the page's origin, so no host permissions). Costs no Apollo credits.
- **`src/lib/site-scan.ts`** (self-contained, because Chrome serializes it into the tab) extracts:
  - Current page: headline and announcement lines.
  - Pricing: enterprise/SSO/SCIM/contract lines.
  - Security: certifications.
  - Blog/changelog: post titles with dates.
- **Real-site tuning** (linear.app, intercom.com, gorgias.com, vercel.com, notion.com):
  - Dropped text glued from several elements ("PulseInboxMy issues"): layout noise.
  - Post titles must link to their own page; this removes section labels and headings inside a single post.
  - Dates are read only near each item (Linear posts were all getting one date).
  - Text is joined with spaces between elements, so "officeAug 3, 2026" becomes a readable date.
  - Plain dates are read as UTC: "Aug 3" was coming out as Aug 2 in UTC+5:30.
  - Duplicate snippets are removed.
- **Fixed signal library** in `src/lib/site-types.ts`: enterprise push, security/compliance, AI launch, product launch, pricing change, expansion, funding, acquisition, leadership, partnership, customer milestone, none.
- **Jev:** per snippet, a Choice (type) and a Noul (relevance), in batches of 10, run in parallel with the role batches.
  - `eval/site-signals-eval.mjs`: **29/30** on real snippets. The miss: a third-party model's adoption stat labelled "AI launch".
- **Real finds:** Notion: new CTO, ZeroEntropy acquisition, Notion 3.7 agent skills, SOC 2 / ISO. Intercom: "Salesforce signs definitive agreement to acquire Fin", Fin evals launch. Linear: SOC 2, Linear Agent.
- **Panel:** 🌐 rows showing the label plus a verbatim quote, a link to the page path, and the date; "N more from their site" expands.
  - If the site couldn't be read (e.g. a typed-in domain), the card says so.
- **Settings:** a "Website signals" switch (default on). `WhyNow.siteStatus` is `'ok' | 'unavailable' | 'off'`.

**Verified:**
- 66 unit tests, including the reader on fixture HTML in two timezones, a standalone-serialization test, site-signal grouping, and snippet batch remapping.
- The *built, minified* scanner was extracted from `background.js` and run standalone.
- Real sites were scanned and the snippets judged by live Jev (~350ms).
- Not yet clicked through in a real Chrome window.

---

## 2026-09-29 — Role-judgment fix, credit tracking

### Why-now role judgments: wording + batching
**Problem:** Jev counted roles like Account Executive, Backend Engineer and Staff AI PM as "relevant" for a support-QA seller.

**Cause 1: wording.** The old question ("is the company building up the function the seller's product serves?") was too loose.
- Added `eval/roles-eval.mjs`: 66 labelled roles × 3 sellers (support QA, sales engagement, dev platform) × 2 companies (one neutral, one in the seller's own space).
- Results: buyer-team wording 132/132; old wording 117–125; "uses it day to day" 121–127; "judge role not industry" 119–123.
- **Shipped:** "Is this role in the team run by the seller's typical buyers?" (`roleQuestions` in `src/lib/questions.ts`).

**Cause 2: batch size (the main one).** All 40 roles went to Jev in one call, and long lists squeeze answers toward 0.5.
- On 38 real Intercom-style roles, one call of 40 scored 31/38. Batches of 10 scored 38/38 (relevant roles averaged 0.83, irrelevant 0.18), and ran faster (318ms vs 417ms).
- **Shipped:** `judgeWhyNow` in `src/lib/pipeline.ts` runs timing + signals in one call and roles in parallel batches of `ROLE_BATCH = 10`, then maps answers back to the right roles. `src/lib/pipeline.test.ts` covers that mapping.

**Live result:** Intercom went from 7 "relevant" roles (including AE, Brand Voice Lead, Program Manager) to 5, all support or customer success. Linear shows 3.

### Apollo credit tracking
**Finding:** lookups aren't free. Per [Apollo's API pricing](https://docs.apollo.io/docs/api-pricing): organization enrichment = 1 credit, job postings = 1 per page, people enrichment = 1 when found, people search = free. So a new lookup costs **2 credits**.

- `src/lib/credits.ts`: a per-month ledger (company / jobs / reveal), the budget check, lookup cost, and parsing of Apollo's `credit_usage_stats` response.
- **Balance:** `POST /usage_stats/credit_usage_stats` shows the real team balance, but only with a master key. Other keys get 403, which is remembered for 24h. Our test key isn't a master key, so the ledger is the fallback.
- **Recording spends:** after org enrich, after job postings, and after a reveal only when Apollo found the person. Writes are queued so parallel calls can't lose a count.
- **Side panel:** a credit bar at the top (`src/components/CreditBar.tsx`) showing Apollo's balance (master key) or this month's spend (vs. budget, if set). Costs are on the Refresh, Look up and Reveal buttons.
- **Budget:** a new `over_budget` view state, "Monthly credit budget reached", with *Look up anyway* / *Change budget*.
- **Settings → "3 · Apollo credits":** spend breakdown, balance, *Check balance now*, monthly budget, and a hiring-signals switch (off = 1 credit per lookup; why-now then says the signals are off).
- `WhyNow.jobsAvailable` became `jobsStatus: 'ok' | 'unavailable' | 'off'`.

### Also
- Fixed the pushed live test failing type-check (`process` has no Node types in the extension project).
- The live test now asserts that a lookup records exactly `{ company: 1, jobs: 1 }`.

**Verified:** 61 unit tests pass, `tsc` is clean, the build is clean, and the live pipeline passes on intercom.com and linear.app. The panel and settings UI haven't been clicked through in a real Chrome window yet.

---

## 2026-09-29 — Why now

Added timing signals, following the plan's rule that every signal needs evidence. Code writes each signal from Apollo facts; Jev only judges relevance.

- **Findings:**
  - Apollo's organization lookup already includes 6, 12 and 24-month headcount growth, `funding_events` (with news URLs) and department headcounts.
  - `GET /organizations/{id}/job_postings` works (title, url, posted_at, last_seen_at, city/state/country).
- **`src/lib/signals.ts`** builds candidate signals:
  - **Headcount growth/decline:** 6-month change ≥ ±5% or 12-month change ≥ ±10%.
  - **Latest funding:** within 24 months, with its source link. Mergers and acquisitions get their own label.
  - **Hiring volume:** 3 or more open roles.
  - **Open roles:** postings Apollo hasn't seen for 45+ days are dropped. Job titles lose trailing locations and glued-on cities ("Solutions Engineer New Chicago"), so the same role in different cities is counted once.
- **Jev (Decision 2):** a yes/no per open role, a yes/no per signal, and a 4-level timing score. Relevant roles roll up into "Hiring N relevant roles" with a link to each posting.
- **Side panel:** a "Why now" card with the timing label (Hot ≥ 67 / Warm ≥ 34 / Quiet), relevant signals first, less relevant ones collapsed, and source links.
- **Saved accounts and CSV:** added a timing score and the top signal.
- **Speed:** runs in parallel with the contact ranking; the whole lookup takes 1.3–1.8s.

**Verified:** 47 new and existing tests; live on linear.app (Hot 69), intercom.com (Warm 50) and gorgias.com (Warm 45).

---

## 2026-09-29 — v1 (commit `e16358b`)

The first working extension. See `SPEC.md` §1–§12.

- **Setup:** WXT + React + TypeScript, Manifest V3. Permissions: `activeTab`, `sidePanel`, `storage`, and host access to `api.apollo.io` and `api.typesafe.ai` only.
- **Day-1 checks:** both APIs accept extension-origin calls. TypeSafe rejects browser-page requests from an extension origin, so all API calls go through the background worker. Apollo `mixed_people/search` returns 403 for the test key, so `api_search` is used instead (hidden last names, title only).
- **Pipeline:** company lookup → exact rules in code (headcount, country) + Jev fit/checks/persona in parallel with people search → Jev ranks each person.
- **UI:** a side panel (fit card, persona, ranked contacts, email reveal, save) and a settings page (key test, 3-question onboarding → editable rules, saved accounts + CSV).
- **Other:** a 7-day per-domain cache; reveals are kept for good; MIT license; README.
