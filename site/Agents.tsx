import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Stagger order for a child of a revealed block (CSS reads --i). */
const nth = (i: number) => ({ '--i': i }) as CSSProperties;
import session from './agent-session.json';
import { End, Eyebrow, Nav, useReveal } from './Landing';
import { SlatWord } from './SlatWord';

const NPM = 'https://www.npmjs.com/package/sift-gtm';
const AGENT_DIR = 'https://github.com/Aditya-v05/sift/tree/main/agent';
const SKILL = 'https://github.com/Aditya-v05/sift/blob/main/agent/SKILL.md';

export default function Agents() {
  useReveal();
  return (
    <div className="l-page">
      <Nav />
      <main id="top">
        <Hero />
        <Session />
        <Tools />
        <Guardrails />
        <Setup />
        <People />
      </main>
      <End />
    </div>
  );
}

// ---------- hero ----------

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`a-copy ${done ? 'done' : ''}`}
      onClick={() => navigator.clipboard?.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1400)))}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

function Hero() {
  const copy = useRef<HTMLDivElement>(null);
  return (
    <section className="l-hero a-hero">
      <SlatWord word="MCP" quiet={copy} />
      <div className="l-hero-copy" ref={copy}>
        <p className="l-eyebrow dark a-kicker"><i className="l-glyph" aria-hidden /> sift-gtm · MCP server + CLI</p>
        <h1>
          Sift, for your<br /><em>agents.</em>
        </h1>
        <p className="l-lede">
          The side panel's three answers as tools any agent can call: does the company fit, why now, who to email. Same
          engine, your own keys, and a budget the agent can't raise.
        </p>
        <div className="a-cmd">
          <code>npx sift-gtm mcp<i className="a-caret" aria-hidden /></code>
          <Copy text="npx sift-gtm mcp" />
        </div>
        <div className="l-ctas">
          <a className="l-btn cream" href="#setup">Set it up</a>
          <a className="l-btn glass" href="#session">See a real session</a>
        </div>
        <p className="l-fine">Works with Claude Code, Codex, Gemini CLI, Cursor, Claude Desktop, VS Code, Windsurf, opencode and any MCP client · MIT</p>
      </div>
    </section>
  );
}

// ---------- a real session ----------

/** Bold, numbered lists and paragraphs: enough markdown for an agent's answer. */
function Md({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\d+\.\s/.test(l.trim()))) {
          return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.trim().replace(/^\d+\.\s/, ''))}</li>)}</ol>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </>
  );
}

type Step = { tool: string; input: Record<string, unknown>; summary: string } | { say: string };

function Session() {
  const steps = session.steps as Step[];
  return (
    <section id="session" className="l-wrap a-session">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="A real session" />
        <h2>Price it, run it, <em>explain it.</em></h2>
        <p>
          Claude Code with only Sift's MCP server connected, asked to rank three accounts. Nothing below is edited
          except for length. The three companies were already cached, so Sift spent nothing.
        </p>
      </div>
      <div className="a-video" data-reveal>
        <video src="/agents-demo.mp4" poster="/agents-demo-poster.jpg" width={1280} height={720} muted loop playsInline autoPlay controls={false}
          aria-label="Claude Code using Sift's MCP tools: it prices three accounts, looks them up for free from the cache, and ranks them with evidence" />
      </div>
      <div className="a-chat" data-reveal>
        <div className="a-msg user">
          <span className="a-who">You</span>
          <p>{session.prompt}</p>
        </div>
        <div className="a-steps">
          {steps.map((s, i) =>
            'tool' in s ? (
              <div className="a-step" key={i} style={nth(i)}>
                <code className="a-tool">{s.tool}<span>({Object.entries(s.input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})</span></code>
                <span className="a-res">{s.summary}</span>
              </div>
            ) : (
              <p className="a-say" key={i} style={nth(i)}>{s.say}</p>
            ),
          )}
        </div>
        <div className="a-msg agent" style={nth(steps.length + 1)}>
          <span className="a-who">Agent</span>
          <div className="a-answer"><Md text={session.answer} /></div>
        </div>
        <p className="a-meta">
          Recorded {session.recorded} · {session.client} · Sift spent {session.sift_spent_credits} credits
        </p>
      </div>
    </section>
  );
}

// ---------- tools ----------

const TOOLS: [string, string, string][] = [
  ['sift_company', 'Fit score with every requirement (met, near, unsure, not met), why-now signals with their evidence, the best persona, and the top ranked contacts. Never reveals emails.', '2 credits if new · free for 7 days'],
  ['list_contacts', 'Every ranked person Sift found at a company it already looked up.', 'free'],
  ['reveal_email', 'Verified emails for the people the agent chooses.', '1 credit per person found'],
  ['quote', 'What a batch would cost, and whether it fits the budget. Agents call it first.', 'free'],
  ['budget', 'This month’s spend, the limit, and the Apollo or treg balance.', 'free'],
  ['get_icp / set_icp', 'The ideal customer profile everything is judged against.', 'free'],
];

function Tools() {
  return (
    <section id="tools" className="l-wrap a-tools">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="The tools" />
        <h2>Cheap first. <em>Spending explicit.</em></h2>
        <p>Through treg a credit is $0.026: about $0.05 for a new company and $0.026 per email. Finding people is free.</p>
      </div>
      <div className="a-table" data-reveal>
        {TOOLS.map(([name, what, cost]) => (
          <div className="a-row" key={name} style={nth(TOOLS.findIndex((t) => t[0] === name))}>
            <code>{name}</code>
            <p>{what}</p>
            <span>{cost}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- guardrails ----------

function Guardrails() {
  const items: [string, string][] = [
    ['A budget it can’t raise', 'The monthly cap is enforced inside Sift before anything is charged, and there is no tool to change it. Only you can, from the environment or the CLI.'],
    ['Reveals are deliberate', 'Looking a company up never reveals an email. The agent asks for specific people, and pays only for those.'],
    ['Reasons, not prose', 'Every score carries its checks and every signal its source, so the agent explains with evidence instead of inventing why.'],
    ['Your keys, no server', 'Keys stay in the environment and are never written to disk. Calls go from your machine to Apollo or treg, and Jev.'],
  ];
  return (
    <section className="l-wrap a-guard">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="Guardrails" />
        <h2>Built to be <em>left alone with.</em></h2>
      </div>
      <div className="a-cards" data-reveal>
        {items.map(([t, d], i) => (
          <div className="a-card" key={t} style={nth(i)}>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- setup ----------

// Each verified on 2026-10-08 with the tool's own `mcp add` (Claude Code, Codex, Gemini CLI) or a live
// connection (opencode); the editors use their documented formats.
const ENV = `"TYPESAFE_KEY": "…",
        "TREG_KEY": "…",
        "SIFT_BUDGET_USD": "5"`;
const MCP_SERVERS = `{
  "mcpServers": {
    "sift": {
      "command": "npx",
      "args": ["-y", "sift-gtm", "mcp"],
      "env": {
        ${ENV}
      }
    }
  }
}`;

const SETUPS: { id: string; label: string; where: string; code: string }[] = [
  {
    id: 'claude-code', label: 'Claude Code', where: 'One command in your terminal.',
    code: `claude mcp add sift \\
  -e TYPESAFE_KEY=… -e TREG_KEY=… -e SIFT_BUDGET_USD=5 \\
  -- npx -y sift-gtm mcp`,
  },
  {
    id: 'codex', label: 'Codex', where: 'One command (OpenAI Codex CLI). It writes the block below to ~/.codex/config.toml.',
    code: `codex mcp add sift \\
  --env TYPESAFE_KEY=… --env TREG_KEY=… --env SIFT_BUDGET_USD=5 \\
  -- npx -y sift-gtm mcp

# ~/.codex/config.toml
[mcp_servers.sift]
command = "npx"
args = ["-y", "sift-gtm", "mcp"]

[mcp_servers.sift.env]
TYPESAFE_KEY = "…"
TREG_KEY = "…"
SIFT_BUDGET_USD = "5"`,
  },
  {
    id: 'gemini', label: 'Gemini CLI', where: 'One command. It writes ~/.gemini/settings.json.',
    code: `gemini mcp add -s user \\
  -e TYPESAFE_KEY=… -e TREG_KEY=… -e SIFT_BUDGET_USD=5 \\
  sift npx -y sift-gtm mcp`,
  },
  { id: 'cursor', label: 'Cursor', where: 'Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).', code: MCP_SERVERS },
  { id: 'desktop', label: 'Claude Desktop', where: 'Settings → Developer → Edit Config (claude_desktop_config.json), then restart Claude.', code: MCP_SERVERS },
  {
    id: 'vscode', label: 'VS Code', where: 'Copilot agent mode: add to .vscode/mcp.json in your workspace (or run “MCP: Add Server”).',
    code: `{
  "servers": {
    "sift": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "sift-gtm", "mcp"],
      "env": {
        ${ENV}
      }
    }
  }
}`,
  },
  { id: 'windsurf', label: 'Windsurf', where: 'Add to ~/.codeium/windsurf/mcp_config.json.', code: MCP_SERVERS },
  {
    id: 'opencode', label: 'opencode', where: 'Add to opencode.json in your project (or ~/.config/opencode/opencode.json).',
    code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "sift": {
      "type": "local",
      "command": ["npx", "-y", "sift-gtm", "mcp"],
      "environment": {
        ${ENV}
      }
    }
  }
}`,
  },
  {
    id: 'other', label: 'Any MCP client', where: 'Sift is a standard stdio MCP server. Point your client at this command, with the keys in its environment.',
    code: `command:  npx -y sift-gtm mcp        (stdio)
env:      TYPESAFE_KEY   Jev, from typesafe.ai
          TREG_KEY       or APOLLO_KEY
          SIFT_BUDGET_USD  optional monthly cap, e.g. 5`,
  },
];

function Setup() {
  const [tab, setTab] = useState(SETUPS[0]!.id);
  const s = SETUPS.find((x) => x.id === tab)!;
  // A single underline slides to the active tab (and to its row when the tabs wrap).
  const tabs = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const el = tabs.current?.querySelector<HTMLElement>('button.on');
      if (el) setBar({ width: el.offsetWidth, transform: `translate(${el.offsetLeft}px, ${el.offsetTop + el.offsetHeight - 2}px)`, opacity: 1 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [tab]);
  return (
    <section id="setup" className="l-wrap a-setup">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="Setup" />
        <h2>Any agent. <em>Two keys.</em></h2>
        <p>
          <strong>TYPESAFE_KEY</strong> for Jev, from typesafe.ai, and either <strong>TREG_KEY</strong> (pay per call, no
          Apollo plan) or <strong>APOLLO_KEY</strong>. The budget defaults to 40 credits a month.
        </p>
      </div>
      <div className="a-code-wrap" data-reveal>
        <div className="a-tabs" role="tablist" ref={tabs}>
          <span className="a-tabbar" style={bar} aria-hidden />
          {SETUPS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
          ))}
        </div>
        <div className="a-swap" key={tab}>
          <p className="a-where">{s.where}</p>
          <pre className="a-code"><code>{s.code}</code><Copy text={s.code} /></pre>
        </div>
        <p className="a-where">
          Agents that load skills can also use the playbook, <a href={SKILL}>SKILL.md</a>: when to price, when to reveal, and
          how to explain results. Package: <a href={NPM}>npm</a> · <a href={AGENT_DIR}>source</a>.
        </p>
      </div>
    </section>
  );
}

// ---------- for people ----------

const CLI = `$ npx sift-gtm --from accounts.csv --out ranked.csv
3 companies · 1 cached · up to 4 credits · 38 credits left this month
  gorgias.com: 80% fit, timing 52
  kustomer.com: 83% fit, timing 44
  helpscout.com: 78% fit, timing 57
Wrote 3 rows to ranked.csv, best first.`;

const CSV: string[][] = [
  ['Help Scout', '70', '78', '57', '11 open roles', 'Shawna F., COO'],
  ['Gorgias', '69', '80', '52', 'Hiring 5 relevant roles', 'Aleksandra P., Director of Support'],
  ['Kustomer', '67', '83', '44', 'Raised $30M Series B', 'Robert R., Head of Support Engineering'],
];

function People() {
  return (
    <section className="l-wrap a-people">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="For people too" />
        <h2>A whole list, <em>ranked.</em></h2>
        <p>The same engine in your terminal. Price a CSV first with <code>--dry-run</code>, then get it back ranked by priority (60% fit, 40% timing), with each company’s top signal and best contact.</p>
      </div>
      <div className="a-term" data-reveal>
        <pre className="a-code dark"><code>{CLI}</code></pre>
        <div className="a-csv">
          <div className="a-csv-row head"><span>Company</span><span>Priority</span><span>Fit</span><span>Timing</span><span>Top signal</span><span>Best contact</span></div>
          {CSV.map((r) => (
            <div className="a-csv-row" key={r[0]} style={nth(CSV.indexOf(r))}>{r.map((c, i) => <span key={i}>{c}</span>)}</div>
          ))}
        </div>
        <p className="a-where">A real run, 3 accounts for 4 Apollo credits. Add <code>--reveal-top 1 --min-fit 70</code> for emails at strong fits.</p>
      </div>
    </section>
  );
}
