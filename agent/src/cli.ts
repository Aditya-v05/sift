/*
 * sift-gtm: Sift in the terminal, and the MCP server for agents.
 *
 *   sift-gtm mcp                              MCP server on stdio (for Claude Desktop, Claude Code, Cursor…)
 *   sift-gtm acme.com [--json] [--refresh]    qualify one company
 *   sift-gtm --from list.csv [--out out.csv]  qualify a list, ranked; --dry-run prices it first
 *   sift-gtm reveal acme.com <person_id>…     reveal emails (1 credit each when found)
 *   sift-gtm icp [--sells … --icp … --buyers …]
 *   sift-gtm budget [<credits> | --usd <n> | off]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SiftError, budget, getIcp, init, quote, revealEmails, setBudget, setIcp, siftCompany } from './engine';
import { serveStdio } from './mcp';
import { VERSION } from './version';

const HELP = `sift-gtm ${VERSION}: qualify companies for outbound. Fit, why now, who to email.

Usage
  sift-gtm <domain> [--json] [--refresh] [--contacts <n>]
  sift-gtm --from <file.csv|txt> [--out <file.csv>] [--dry-run] [--concurrency <n>] [--reveal-top <n>] [--min-fit <score>]
  sift-gtm reveal <domain> <person_id> [<person_id>…]
  sift-gtm icp [--sells "<what you sell>" --icp "<ideal customer>" --buyers "<titles>"]
  sift-gtm budget [<credits> | --usd <dollars> | off]
  sift-gtm mcp                    run the MCP server for AI agents (stdio)

Keys (environment)
  TYPESAFE_KEY                    Jev, from typesafe.ai (judgments)
  APOLLO_KEY  or  TREG_KEY        company and people data: your Apollo key, or treg.to (pay per call)
  SIFT_PROVIDER=apollo|treg       which one, when both are set
  SIFT_BUDGET / SIFT_BUDGET_USD   monthly cap in credits / dollars (default 40 credits; "off" for none)

Costs: a new company is 2 credits ($0.052 via treg), free for 7 days after; finding people is free;
an email is 1 credit ($0.026), only when found. Data lives in ~/.sift (SIFT_HOME); keys are never stored.
`;

function args(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) flags[k] = argv[++i]!;
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);
const num = (v: string | true | undefined) => (typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const out = (s = '') => process.stdout.write(`${s}\n`);
const money = (c: { credits: number; usd: number | null }) => (c.usd !== null ? `$${c.usd.toFixed(3)}` : `${c.credits} credit${c.credits === 1 ? '' : 's'}`);

// ---------- one company, for a person ----------

function printResult(r: Awaited<ReturnType<typeof siftCompany>>) {
  out(`${r.company.name}  (${r.domain})`);
  out(`  ${[r.company.headcount && `${r.company.headcount} employees`, r.company.funding_stage, r.company.industry, r.company.country].filter(Boolean).join(' · ')}`);
  if (r.fit) {
    out(`\nFit ${r.fit.score}% · ${r.fit.verdict}`);
    for (const c of r.fit.checks) {
      const mark = { met: '✓', near: '~', unsure: '?', not_met: '✗', unknown: '·' }[c.state] ?? '·';
      out(`  ${mark} ${c.requirement}${c.detail ? `  (${c.detail})` : ''}`);
    }
  }
  if (r.why_now) {
    out(`\nWhy now · timing ${r.why_now.timing ?? '–'} · ${r.why_now.verdict}`);
    for (const s of r.why_now.signals.slice(0, 5)) out(`  ${s.relevance}%  ${s.signal}${s.detail ? ` · ${s.detail}` : ''}`);
    if (!r.why_now.website_read) out('  (website not read)');
  }
  if (r.contacts.length) {
    out(`\nWho to email${r.best_persona ? ` · best persona ${r.best_persona}` : ''} · ${r.contacts_total} found`);
    for (const c of r.contacts) out(`  ${String(c.rank ?? '–').padStart(3)}  ${c.name}, ${c.title ?? ''}${'email' in c && c.email ? `  <${c.email}>` : ''}  [${c.person_id}]`);
  }
  out(`\n${r.cost.cached ? 'Cached: free' : `Cost: ${money(r.cost)}`}${r.priority !== null ? ` · priority ${r.priority}` : ''}`);
}

// ---------- a list ----------

function readDomains(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const cells = (l: string) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const header = cells(rows[0]!).map((h) => h.toLowerCase());
  const col = header.findIndex((h) => ['domain', 'website', 'url', 'company_domain', 'company domain'].includes(h));
  const body = col >= 0 ? rows.slice(1) : rows;
  return [...new Set(body.map((l) => cells(l)[col >= 0 ? col : 0]!).filter(Boolean))];
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function batch(file: string, flags: Record<string, string | true>) {
  const domains = readDomains(file);
  if (!domains.length) throw new SiftError('bad_domain', `No domains found in ${file}.`);
  const revealTop = num(flags['reveal-top']) ?? 0;
  const q = await quote(domains, revealTop);
  out(`${domains.length} companies · ${q.companies.filter((c) => c.cached).length} cached · up to ${money(q.total)}` +
    (q.budget.remaining ? ` · ${money(q.budget.remaining)} left this month` : ''));
  if (flags['dry-run']) return;
  if (!q.budget.fits) out('Note: this may cross the monthly budget; Sift stops when it would.');

  const minFit = num(flags['min-fit']) ?? 70;
  const concurrency = Math.max(1, Math.min(num(flags.concurrency) ?? 3, 8));
  const rows: Record<string, unknown>[] = [];
  const queue = [...domains];
  let stop: string | null = null;
  const worker = async () => {
    for (let d = queue.shift(); d && !stop; d = queue.shift()) {
      try {
        const r = await siftCompany(d, { contacts: 5 });
        let top = r.contacts[0];
        if (revealTop && r.fit && r.fit.score >= minFit && r.contacts.length) {
          const ids = r.contacts.slice(0, revealTop).map((c) => c.person_id);
          const rev = await revealEmails(d, ids);
          top = rev.people[0] ?? top;
        }
        rows.push({
          domain: r.domain, company: r.company.name, priority: r.priority, fit: r.fit?.score, fit_verdict: r.fit?.verdict,
          timing: r.why_now?.timing, timing_verdict: r.why_now?.verdict, top_signal: r.why_now?.signals[0]?.signal ?? '',
          best_contact: top?.name ?? '', title: top?.title ?? '', rank: top?.rank ?? '',
          email: top && 'email' in top ? top.email ?? '' : '', person_id: top?.person_id ?? '', cached: r.cost.cached,
        });
        process.stderr.write(`  ${r.domain}: ${r.fit?.score ?? '–'}% fit, timing ${r.why_now?.timing ?? '–'}\n`);
      } catch (err) {
        if (err instanceof SiftError && err.code === 'over_budget') stop = err.message;
        rows.push({ domain: d, error: err instanceof Error ? err.message : String(err) });
        process.stderr.write(`  ${d}: ${err instanceof Error ? err.message : err}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  rows.sort((a, b) => Number(b.priority ?? -1) - Number(a.priority ?? -1));
  const cols = ['domain', 'company', 'priority', 'fit', 'fit_verdict', 'timing', 'timing_verdict', 'top_signal', 'best_contact', 'title', 'rank', 'email', 'person_id', 'cached', 'error'];
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
  const target = str(flags.out);
  if (target) {
    writeFileSync(target, csv);
    out(`Wrote ${rows.length} rows to ${target}, best first.`);
  } else process.stdout.write(csv);
  const b = await budget();
  out(`Spent this month: ${money(b.spent)}${b.monthly_limit ? ` of ${money(b.monthly_limit)}` : ''}`);
  if (stop) out(`Stopped early: ${stop}`);
}

// ---------- main ----------

export async function main(argv = process.argv.slice(2)) {
  const { pos, flags } = args(argv);
  const [cmd, ...rest] = pos;
  if (flags.version || cmd === 'version') return out(VERSION);
  if (cmd === 'mcp') return serveStdio();
  if (flags.help || cmd === 'help' || (!cmd && !flags.from)) return out(HELP);
  await init();

  if (flags.from) return batch(String(flags.from), flags);

  if (cmd === 'reveal') {
    const [domain, ...ids] = rest;
    if (!domain || !ids.length) return out('Usage: sift-gtm reveal <domain> <person_id> [<person_id>…]');
    const r = await revealEmails(domain, ids, num(flags['max-credits']));
    if (flags.json) return out(JSON.stringify(r, null, 2));
    for (const p of r.people) out(`${p.name}, ${p.title ?? ''}: ${'email' in p && p.email ? `${p.email} (${p.email_status ?? 'unknown'})` : 'no email found'}`);
    return out(`Cost: ${money(r.cost)}`);
  }

  if (cmd === 'icp') {
    const sells = str(flags.sells), icp = str(flags.icp), buyers = str(flags.buyers);
    const res = sells || icp || buyers ? await setIcp({ sells: sells ?? '', icp: icp ?? '', buyers: buyers ?? '' }) : await getIcp();
    return out(res ? JSON.stringify(res, null, 2) : 'No ICP yet. Set one: sift-gtm icp --sells "…" --icp "…" --buyers "…"');
  }

  if (cmd === 'budget') {
    const arg = rest[0];
    if (arg === 'off') return out(JSON.stringify(await setBudget({ credits: null }), null, 2));
    if (num(flags.usd) !== undefined) return out(JSON.stringify(await setBudget({ usd: num(flags.usd) }), null, 2));
    if (arg !== undefined && num(arg) !== undefined) return out(JSON.stringify(await setBudget({ credits: num(arg) }), null, 2));
    return out(JSON.stringify(await budget(), null, 2));
  }

  const r = await siftCompany(cmd!, { refresh: !!flags.refresh, contacts: num(flags.contacts), maxCredits: num(flags['max-credits']) });
  return flags.json ? out(JSON.stringify(r, null, 2)) : printResult(r);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof SiftError ? err.message : err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});
