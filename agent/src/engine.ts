/*
 * Sift for agents and the terminal: the extension's engine (src/lib) with keys from the environment, the
 * website read by fetching it, and spending guarded before anything is charged.
 *
 * Every function returns plain JSON that explains itself: scores carry their checks, signals their sources,
 * and every paid call reports what it cost. Money is counted the way Sift counts it: Apollo credits, which
 * through treg or Monid cost $0.026 each.
 */
import { hasDataKey, isGateway, type Source } from '../../src/lib/access';
import * as apollo from '../../src/lib/apollo';
import { priority } from '../../src/lib/accounts';
import { checkState } from '../../src/lib/mapping';
import { lookupCost, overBudget, totalSpent, usdFor, type Settings } from '../../src/lib/credits';
import { refreshBalance, revealContacts, runLookup } from '../../src/lib/pipeline';
import { normalizeDomainInput } from '../../src/lib/resolver';
import { generateRules } from '../../src/lib/rules';
import * as store from '../../src/lib/storage';
import type { Contact, Keys, LookupResult, ProfileAnswers, Rules } from '../../src/lib/types';
import { readSiteNode } from './site-node';

// ---------- setup: keys from the environment, budget, the gateway cost ledger ----------

export interface Env {
  [k: string]: string | undefined;
}

/** Monthly cap when the user sets none: 40 paid calls (40 Apollo credits, or $1.04 through treg or Monid). */
export const DEFAULT_BUDGET = 40;

export class SiftError extends Error {
  constructor(
    readonly code: 'missing_keys' | 'missing_icp' | 'over_budget' | 'over_max' | 'bad_domain' | 'not_found' | 'api_error',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let ready: Promise<Keys | null> | null = null;

/** Read keys and budget from the environment once per process. Keys stay in memory only. */
export function init(env: Env = process.env): Promise<Keys | null> {
  ready ??= (async () => {
    apollo.onGatewayCost((micro) => void store.recordUsd(micro));
    const treg = env.TREG_KEY?.trim() ?? '';
    const monid = env.MONID_KEY?.trim() ?? '';
    const apolloKey = env.APOLLO_KEY?.trim() ?? '';
    // SIFT_PROVIDER picks when several keys are set; otherwise Apollo, then treg, then Monid, whichever is there.
    const asked = env.SIFT_PROVIDER?.trim().toLowerCase();
    const provider: Source = asked === 'apollo' || asked === 'treg' || asked === 'monid' ? asked
      : apolloKey ? 'apollo' : treg ? 'treg' : monid ? 'monid' : 'apollo';
    const keys: Keys = { apollo: apolloKey, typesafe: env.TYPESAFE_KEY?.trim() ?? '', provider, treg, monid };
    await store.setKeys(keys);

    const settings = await store.getSettings();
    const fromEnv = budgetFromEnv(env);
    const next: Settings = {
      ...settings,
      monthlyBudget: fromEnv !== undefined ? fromEnv : settings.monthlyBudget ?? DEFAULT_BUDGET,
      scanSite: env.SIFT_SCAN_SITE === '0' ? false : settings.scanSite,
      fetchJobs: env.SIFT_FETCH_JOBS === '0' ? false : settings.fetchJobs,
    };
    if (JSON.stringify(next) !== JSON.stringify(settings)) await store.setSettings(next);
    return hasDataKey(keys) && keys.typesafe ? keys : null;
  })();
  return ready;
}

/** For tests: start over with a new environment. */
export function resetEngine() {
  ready = null;
}

/** SIFT_BUDGET (credits) or SIFT_BUDGET_USD (dollars through treg or Monid); "off" removes the cap. */
function budgetFromEnv(env: Env): number | null | undefined {
  const usd = env.SIFT_BUDGET_USD?.trim();
  const credits = env.SIFT_BUDGET?.trim();
  if (usd === 'off' || credits === 'off') return null;
  if (usd && Number.isFinite(Number(usd))) return Math.floor(Number(usd) / 0.026);
  if (credits && Number.isFinite(Number(credits))) return Math.round(Number(credits));
  return undefined;
}

async function requireReady(): Promise<Keys> {
  const keys = await init();
  if (!keys) {
    throw new SiftError(
      'missing_keys',
      'Sift needs keys: set TYPESAFE_KEY (Jev, from typesafe.ai) and one of APOLLO_KEY, TREG_KEY (from treg.to) or MONID_KEY (from monid.ai) in the environment.',
    );
  }
  if (!(await store.getProfile())) {
    throw new SiftError('missing_icp', 'No ICP yet: describe what you sell, your ideal customer and who buys (set_icp, or `sift-gtm icp`).');
  }
  return keys;
}

/** Through a pay-per-call gateway (treg, Monid): money reads in dollars. */
const viaTreg = (keys: Keys | null | undefined) => isGateway(keys?.provider);

function cleanDomain(input: string): string {
  const d = normalizeDomainInput(input);
  if (!d) throw new SiftError('bad_domain', `"${input}" isn't a company domain. Pass something like acme.com.`);
  return d;
}

// ---------- money ----------

export interface Cost {
  credits: number;
  /** Dollars, when the data comes through treg. */
  usd: number | null;
  cached?: boolean;
}

const cost = (credits: number, treg: boolean, usdMicro?: number): Cost => ({
  credits,
  usd: treg ? Math.round((usdMicro !== undefined ? usdMicro / 1e6 : usdFor(credits)) * 1000) / 1000 : null,
});

async function spendSnapshot() {
  const l = await store.getLedger();
  return { credits: totalSpent(l), usdMicro: l.usdMicro ?? 0 };
}

/** Refuse before spending: past the monthly budget, or past the caller's own cap for this call. */
async function guard(credits: number, maxCredits: number | undefined, what: string) {
  if (credits === 0) return;
  if (maxCredits !== undefined && credits > maxCredits) {
    throw new SiftError('over_max', `${what} costs up to ${credits} credit${credits === 1 ? '' : 's'}, more than max_credits (${maxCredits}). Raise max_credits or skip it.`, {
      cost: credits,
      max_credits: maxCredits,
    });
  }
  const [settings, ledger, keys] = await Promise.all([store.getSettings(), store.getLedger(), store.getKeys()]);
  if (overBudget(ledger, settings, credits)) {
    const t = viaTreg(keys);
    const spent = totalSpent(ledger);
    throw new SiftError(
      'over_budget',
      `Monthly budget reached: ${t ? `$${usdFor(spent).toFixed(2)} of $${usdFor(settings.monthlyBudget!).toFixed(2)}` : `${spent} of ${settings.monthlyBudget} credits`} spent, and ${what} needs ${credits} more. Ask the user to raise it (SIFT_BUDGET_USD / SIFT_BUDGET, or \`sift-gtm budget\`).`,
      { spent, budget: settings.monthlyBudget, needed: credits },
    );
  }
}

// ---------- results, explained ----------

const fitWord = (score: number) => (score >= 70 ? 'strong' : score >= 40 ? 'partial' : 'weak');
const timingWord = (t: number | null) => (t === null ? 'no signals' : t >= 67 ? 'hot' : t >= 34 ? 'warm' : 'quiet');

const name = (c: Contact) => `${c.firstName} ${c.lastName ?? (c.lastNameObfuscated ? `${c.lastNameObfuscated[0]}.` : '')}`.trim();

export function contactJson(c: Contact) {
  return {
    person_id: c.apolloId,
    name: name(c),
    title: c.headline ?? c.title,
    rank: c.rank,
    has_email: c.hasEmail,
    ...(c.revealedAt !== undefined ? { email: c.email ?? null, email_status: c.emailStatus ?? null, linkedin: c.linkedin ?? null } : {}),
  };
}

export function resultJson(r: LookupResult, contacts = 5) {
  const all = r.contacts ?? [];
  return {
    domain: r.domain,
    company: {
      name: r.company.name, headcount: r.company.headcount, country: r.company.country, industry: r.company.industry,
      funding_stage: r.company.fundingStage, founded: r.company.foundedYear, linkedin: r.company.linkedin,
    },
    fit: r.fit && {
      score: r.fit.score,
      verdict: fitWord(r.fit.score),
      requirements: r.fit.requirements ?? null,
      overall_judgment: r.fit.overall ?? null,
      checks: r.fit.checks.map((c) => ({ requirement: c.label, state: checkState(c), detail: c.detail ?? (c.p !== undefined ? `${Math.round(c.p * 100)}%` : null) })),
    },
    why_now: r.whyNow && {
      timing: r.whyNow.timing,
      verdict: timingWord(r.whyNow.timing),
      signals: r.whyNow.signals.map((s) => ({
        signal: s.label, detail: s.detail ?? null, relevance: Math.round(s.relevance * 100),
        evidence: s.evidence.map((e) => ({ text: e.label, url: e.url ?? null, date: e.date ?? null })),
      })),
      website_read: r.whyNow.siteStatus === 'ok',
      job_postings_read: r.whyNow.jobsStatus === 'ok',
    },
    best_persona: r.persona?.chosen ?? null,
    priority: priority(r),
    contacts: all.slice(0, contacts).map(contactJson),
    contacts_total: all.length,
    fetched_at: new Date(r.fetchedAt).toISOString(),
  };
}

// ---------- the agent's actions ----------

export interface SiftOptions {
  /** Look it up again even if cached (costs again). */
  refresh?: boolean;
  /** Refuse if this would cost more credits than this. */
  maxCredits?: number;
  /** How many ranked contacts to include. */
  contacts?: number;
}

/** Fit, why now and ranked people for one company. 2 credits when new, free when cached (7 days). */
export async function siftCompany(domainInput: string, opts: SiftOptions = {}) {
  const keys = await requireReady();
  const domain = cleanDomain(domainInput);
  const cachedHit = !opts.refresh && (await store.getCached(domain));
  const worst = cachedHit ? 0 : lookupCost(await store.getSettings());
  await guard(worst, opts.maxCredits, `Looking up ${domain}`);

  const before = await spendSnapshot();
  const view = await runLookup(null, domain, { force: opts.refresh, allowOverBudget: true, site: (d) => readSiteNode(d) });
  const after = await spendSnapshot();
  const spent = cost(after.credits - before.credits, viaTreg(keys), after.usdMicro - before.usdMicro);

  switch (view.status) {
    case 'done':
      return { ...resultJson(view.result, opts.contacts ?? 5), cost: { ...spent, cached: view.cached } };
    case 'not_found':
      throw new SiftError('not_found', `Apollo doesn't know ${domain}. Try the company's main domain.`, { cost: spent });
    case 'error':
      throw new SiftError('api_error', view.error.message ? `${view.error.service}: ${view.error.message}` : 'Lookup failed', { cost: spent, status: view.error.status });
    case 'needs_setup':
      throw new SiftError('missing_keys', 'Sift is missing keys or an ICP.');
    default:
      throw new SiftError('api_error', `Unexpected state: ${view.status}`);
  }
}

/** Every ranked contact Sift found for a company it has already looked up (free). */
export async function listContacts(domainInput: string, limit = 30) {
  await requireReady();
  const domain = cleanDomain(domainInput);
  const hit = await store.getCached(domain);
  if (!hit) throw new SiftError('not_found', `${domain} hasn't been looked up in the last 7 days. Call sift_company first.`);
  const contacts = await store.withReveals(hit.contacts ?? []);
  return { domain, contacts: contacts.slice(0, limit).map(contactJson), contacts_total: contacts.length };
}

/** Reveal emails for people at a company Sift looked up. 1 credit per person Apollo finds. */
export async function revealEmails(domainInput: string, personIds: string[], maxCredits?: number) {
  const keys = await requireReady();
  const domain = cleanDomain(domainInput);
  const hit = await store.getCached(domain);
  if (!hit) throw new SiftError('not_found', `${domain} hasn't been looked up in the last 7 days. Call sift_company first.`);
  const known = new Map((await store.withReveals(hit.contacts ?? [])).map((c) => [c.apolloId, c]));
  const unknown = personIds.filter((id) => !known.has(id));
  if (unknown.length) throw new SiftError('not_found', `Not among ${domain}'s contacts: ${unknown.join(', ')}. Use person_id values from sift_company or list_contacts.`);
  const already = personIds.filter((id) => known.get(id)!.revealedAt !== undefined);
  const todo = [...new Set(personIds.filter((id) => known.get(id)!.revealedAt === undefined))];
  await guard(todo.length, maxCredits, `Revealing ${todo.length} email${todo.length === 1 ? '' : 's'}`);

  const before = await spendSnapshot();
  const outcome = todo.length ? await revealContacts(null, domain, todo) : { revealed: 0, noEmail: 0, failed: 0, error: null };
  const after = await spendSnapshot();
  const people = await store.withReveals(personIds.map((id) => known.get(id)!));
  return {
    domain,
    people: people.map(contactJson),
    revealed: outcome.revealed,
    no_email: outcome.noEmail,
    failed: outcome.failed,
    already_revealed: already.length,
    ...(outcome.error ? { error: outcome.error.message } : {}),
    cost: cost(after.credits - before.credits, viaTreg(keys), after.usdMicro - before.usdMicro),
  };
}

/** What a batch would cost before running it (free). */
export async function quote(domains: string[], revealsPerCompany = 0) {
  const keys = await init();
  const settings = await store.getSettings();
  const ledger = await store.getLedger();
  const per = lookupCost(settings);
  const rows = await Promise.all(
    domains.map(async (input) => {
      const domain = normalizeDomainInput(input);
      if (!domain) return { input, domain: null, cached: false, credits: 0, note: 'not a domain' };
      const cached = !!(await store.getCached(domain));
      return { input, domain, cached, credits: (cached ? 0 : per) + revealsPerCompany };
    }),
  );
  const total = rows.reduce((n, r) => n + r.credits, 0);
  const spent = totalSpent(ledger);
  const budget = settings.monthlyBudget;
  return {
    companies: rows,
    total: cost(total, viaTreg(keys)),
    budget: { ...budgetJson(budget, spent, viaTreg(keys)), fits: budget === null || spent + total <= budget },
  };
}

function budgetJson(budget: number | null, spent: number, treg: boolean) {
  return {
    monthly_limit: budget === null ? null : cost(budget, treg),
    spent: cost(spent, treg),
    remaining: budget === null ? null : cost(Math.max(0, budget - spent), treg),
  };
}

/** This month's spend, the limit, and the account balance where readable (free). */
export async function budget() {
  const keys = await init();
  if (keys) await refreshBalance(true);
  const [settings, ledger, balance] = await Promise.all([store.getSettings(), store.getLedger(), store.getBalance()]);
  const provider: Source = (keys ?? (await store.getKeys()))?.provider ?? 'apollo';
  const treg = isGateway(provider);
  const bal = balance && balance.available
    ? 'usd' in balance ? { [`${provider}_balance_usd`]: balance.usd } : { apollo_credits_left: balance.leftOver }
    : {};
  return {
    provider,
    month: ledger.month,
    ...budgetJson(settings.monthlyBudget, totalSpent(ledger), treg),
    ...(treg ? { spent_usd_exact: Math.round((ledger.usdMicro ?? 0) / 1000) / 1000 } : {}),
    breakdown: { company_lookups: ledger.company, job_postings: ledger.jobs, emails_revealed: ledger.reveal, discover_searches: ledger.search ?? 0 },
    ...bal,
  };
}

/** Set the monthly cap (people only: the MCP server doesn't expose this, so agents can't raise their own limit). */
export async function setBudget(value: { credits?: number | null; usd?: number }) {
  await init();
  const settings = await store.getSettings();
  const monthlyBudget = value.usd !== undefined ? Math.floor(value.usd / 0.026) : value.credits ?? null;
  await store.setSettings({ ...settings, monthlyBudget, budgetUsd: value.usd ?? null });
  return budget();
}

export async function getIcp() {
  const p = await store.getProfile();
  return p ? { answers: p.answers, rules: p.rules, updated_at: new Date(p.updatedAt).toISOString() } : null;
}

/** Describe what you sell; Sift generates the rules (as Settings does) and judges new lookups against them. */
export async function setIcp(answers: ProfileAnswers, edits: Partial<Rules> = {}) {
  for (const k of ['sells', 'icp', 'buyers'] as const) {
    if (!answers[k]?.trim()) throw new SiftError('missing_icp', `"${k}" is required: what you sell, your ideal customer, and who buys.`);
  }
  const rules = { ...generateRules(answers), ...edits };
  await store.setProfile({ answers, rules, updatedAt: Date.now() });
  await store.clearCache(); // cached results were judged against the old ICP
  return getIcp();
}
