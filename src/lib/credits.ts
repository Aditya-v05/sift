/**
 * Apollo credit accounting. Per Apollo's API pricing: organization enrichment = 1 credit,
 * job postings = 1 credit per page, people enrichment = 1 credit when it returns data,
 * organization search (Discover) = 1 credit per page. People API search is free.
 */

export type SpendKind = 'company' | 'jobs' | 'reveal' | 'search';

/** What Sift itself has spent this calendar month (local time). */
export interface Ledger {
  month: string;
  company: number;
  jobs: number;
  reveal: number;
  /** Discover searches; missing on ledgers written before Discover existed. */
  search?: number;
  /** Dollars spent through treg this month, in micro-USD (exact, from treg's cost header). */
  usdMicro?: number;
}

export interface Settings {
  /** Monthly cap on credits (paid calls) Sift may spend; null = no cap. */
  monthlyBudget: number | null;
  /** The cap as the user typed it in dollars (treg mode); monthlyBudget holds it in paid calls at $0.026. */
  budgetUsd?: number | null;
  /** Fetch job postings for "why now" (1 extra credit per lookup). */
  fetchJobs: boolean;
  /** Read the company's own pricing/blog/changelog/security pages (free). */
  scanSite: boolean;
}

/** Apollo's own balance (readable only with a master API key), or the treg prepaid balance in dollars. */
export type Balance =
  | { available: true; limit: number; consumed: number; leftOver: number; cycleEnd: string | null; checkedAt: number }
  | { available: true; usd: number; checkedAt: number }
  | { available: false; checkedAt: number };

export const isTregBalance = (b: Balance | undefined): b is { available: true; usd: number; checkedAt: number } =>
  !!b && b.available && 'usd' in b;

export const DEFAULT_SETTINGS: Settings = { monthlyBudget: null, fetchJobs: true, scanSite: true };

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function emptyLedger(month = monthKey()): Ledger {
  return { month, company: 0, jobs: 0, reveal: 0, search: 0 };
}

/** A ledger from a previous month counts as empty. */
export function current(ledger: Ledger | undefined, month = monthKey()): Ledger {
  return ledger && ledger.month === month ? ledger : emptyLedger(month);
}

export function addUsd(ledger: Ledger | undefined, micro: number, month = monthKey()): Ledger {
  const l = current(ledger, month);
  return { ...l, usdMicro: (l.usdMicro ?? 0) + micro };
}

export function addSpend(ledger: Ledger | undefined, kind: SpendKind, n = 1, month = monthKey()): Ledger {
  const l = current(ledger, month);
  return { ...l, [kind]: (l[kind] ?? 0) + n };
}

export const totalSpent = (l: Ledger) => l.company + l.jobs + l.reveal + (l.search ?? 0);

/** Credits a fresh (uncached) lookup will spend. */
export const lookupCost = (s: Settings) => 1 + (s.fetchJobs ? 1 : 0);

export function overBudget(ledger: Ledger, settings: Settings, upcoming: number): boolean {
  return settings.monthlyBudget !== null && totalSpent(ledger) + upcoming > settings.monthlyBudget;
}

/** Dollars for a number of paid calls through treg. */
export const usdFor = (credits: number) => credits * 0.026;

/** The monthly budget as it should read: '$5.00' through treg (as typed), '200 credits' directly. */
export function budgetLabel(settings: Settings, viaTreg: boolean): string {
  if (settings.monthlyBudget === null) return 'no limit';
  return viaTreg ? `$${(settings.budgetUsd ?? usdFor(settings.monthlyBudget)).toFixed(2)}` : `${settings.monthlyBudget} credits`;
}

/** What's been spent this month against the budget, in the budget's own unit. */
export const spentLabel = (spent: number, viaTreg: boolean) => (viaTreg ? `$${usdFor(spent).toFixed(2)}` : `${spent}`);

/** How a number of Apollo credits reads on a button: '2 cr' directly, '$0.05' through treg ($0.026 a credit). */
export function priceLabel(credits: number, viaTreg: boolean, long = false): string {
  if (viaTreg) return `$${(credits * 0.026).toFixed(credits * 0.026 < 0.1 ? 3 : 2)}`;
  return long ? `${credits} credit${credits === 1 ? '' : 's'}` : `${credits} cr`;
}

/** Parse Apollo's credit_usage_stats response (lead credits are what enrichment draws on), or treg's balance. */
export function parseBalance(body: any, now = Date.now()): Balance {
  const treg = body?.treg;
  if (treg) return typeof treg.balance_usd === 'number' ? { available: true, usd: treg.balance_usd, checkedAt: now } : { available: false, checkedAt: now };
  const lead = body?.credit_usage_stats?.lead_credit;
  if (!lead || typeof lead.limit !== 'number') return { available: false, checkedAt: now };
  return {
    available: true,
    limit: lead.limit,
    consumed: lead.consumed ?? lead.limit - (lead.left_over ?? 0),
    leftOver: lead.left_over ?? lead.limit - (lead.consumed ?? 0),
    cycleEnd: body?.current_credit_cycle?.end_date ?? null,
    checkedAt: now,
  };
}
