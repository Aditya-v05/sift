import { ApiError, request } from './errors';
import type { Company, Contact } from './types';

const BASE = 'https://api.apollo.io/api/v1';

/*
 * Sift reaches Apollo one of three ways: directly with the user's Apollo key, or through a pay-per-call
 * gateway with that gateway's key.
 * - treg (treg.to): its apollo.* endpoints pass Apollo's method, query and body through unchanged and return
 *   Apollo's response verbatim. Verified live on 2026-10-06: search (free), enrich, job postings, lookalike
 *   search and people/match.
 * - Monid (monid.ai): one POST /v1/run per call, naming Apollo's path; Apollo's parameters go in
 *   input.queryParams (arrays as `key[]`) and path parameters in input.pathParams. Apollo's response comes
 *   back unchanged in `output`, with the charge in `billing`. Verified live on 2026-10-08: enrich, job
 *   postings, search (free) and people/match (answers 202 and is polled). Lookalike search isn't offered.
 * Either way everything after the request (mapping, ranking, caching) is shared.
 */
import type { Access } from './access';
export type { Access } from './access';

const TREG = 'https://treg.to';
const MONID = 'https://api.monid.ai';
/** Price of one Apollo credit through a gateway (treg and Monid both, Oct 2026): every paid call costs $0.026. */
export const TREG_USD_PER_CREDIT = 0.026;
/** Per-call cap sent to treg: room for its $0.05 overflow relay on job postings, never more. */
const TREG_MAX_COST = '0.06';

type Op = 'enrich' | 'jobs' | 'companies' | 'match' | 'people';
const TREG_ENDPOINT: Record<Op, string> = {
  enrich: 'apollo.companies.enrich',
  jobs: 'apollo.companies.jobs',
  companies: 'apollo.companies.search',
  match: 'apollo.people.enrich',
  people: 'apollo.people.search',
};
const MONID_ENDPOINT: Record<Op, string> = {
  enrich: '/organizations/enrich',
  jobs: '/organizations/{organization_id}/job_postings',
  companies: '/mixed_companies/search',
  match: '/people/match',
  people: '/mixed_people/api_search',
};

/** Exact dollars a gateway charged (micro-USD: treg's X-Treg-Cost-Micro, Monid's billing). The background records it in the ledger. */
let costListener: (usdMicro: number) => void = () => {};
export function onGatewayCost(fn: (usdMicro: number) => void): void {
  costListener = fn;
}
/** The older name, from when treg was the only gateway. */
export const onTregCost = onGatewayCost;

function apolloHeaders(key: string): HeadersInit {
  return { 'X-Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
}

function tregHeaders(key: string): HeadersInit {
  return { 'X-Treg-Token': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Treg-Route-Max-Cost': TREG_MAX_COST };
}

const monidHeaders = (key: string): HeadersInit => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

/** The same Apollo request, sent directly, through treg, or as a Monid run. `query` starts with '?' or is empty. */
export function route(access: Access, op: Op, apolloPath: string, query = ''): { url: string; headers: HeadersInit } {
  if (access.via === 'monid') return { url: `${MONID}/v1/run`, headers: monidHeaders(access.key) };
  return access.via === 'treg'
    ? { url: `${TREG}/call/${TREG_ENDPOINT[op]}${query}`, headers: tregHeaders(access.key) }
    : { url: `${BASE}${apolloPath}${query}`, headers: apolloHeaders(access.key) };
}

/** A query-string value as Monid's schema wants it: numbers and booleans typed, everything else text. */
const typed = (v: string): unknown => (/^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v);

/** The body of a Monid run for one Apollo request: query and JSON body merged into queryParams (arrays as `key[]`). */
export function monidRun(op: Op, apolloPath: string, query = '', body?: string): { provider: 'apollo'; endpoint: string; input: Record<string, unknown> } {
  const queryParams: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(query)) queryParams[k] = typed(v);
  for (const [k, v] of Object.entries(body ? (JSON.parse(body) as Record<string, unknown>) : {})) {
    if (op === 'companies' && k === 'lookalike_organization_ids') {
      throw new ApiError('monid', 400, 'Finding lookalikes isn\'t available through Monid yet. Switch to treg or your Apollo key in Settings to use Discover.');
    }
    queryParams[Array.isArray(v) ? `${k}[]` : k] = v;
  }
  const input: Record<string, unknown> = { queryParams };
  if (op === 'jobs') {
    input.pathParams = { organization_id: decodeURIComponent(apolloPath.split('/')[2] ?? '') };
  }
  return { provider: 'apollo', endpoint: MONID_ENDPOINT[op], input };
}

/** How long to wait for a Monid run that answered 202 (people/match does, even without phone numbers). */
const MONID_POLL_MS = 1000;
const MONID_POLL_TRIES = 30;

/** Apollo's response out of a finished Monid run, recording the charge; errors as ApiError like any other call. */
async function monidResult(key: string, first: any): Promise<unknown> {
  let run = first;
  for (let i = 0; (run?.status === 'RUNNING' || run?.status === 'PENDING') && i < MONID_POLL_TRIES; i++) {
    await new Promise((r) => setTimeout(r, MONID_POLL_MS));
    run = await request('monid', `${MONID}/v1/runs/${encodeURIComponent(run.runId)}`, { headers: monidHeaders(key) });
  }
  // A finished run reports its charge as billing.reportedCost (micro-USD); a polled one as cost (dollars). A run
  // polled the moment it finishes can come back before its cost is filled in: then it's the listed price per billed call.
  const micro = typeof run?.billing?.reportedCost?.value === 'number' ? run.billing.reportedCost.value
    : typeof run?.cost?.value === 'number' ? Math.round(run.cost.value * 1e6)
      : run?.status === 'COMPLETED' && run?.billedUnits > 0 && typeof run?.price?.amount?.value === 'number' ? Math.round(run.price.amount.value * 1e6) : 0;
  if (micro > 0) costListener(micro);
  const status = run?.status;
  const providerStatus: number | undefined = run?.providerResponse?.httpStatus;
  if (status === 'COMPLETED' && (!providerStatus || providerStatus < 400)) return run.output ?? {};
  if (status === 'RUNNING' || status === 'PENDING') throw new ApiError('monid', null, 'Monid is still working on this call. Retry in a minute.');
  throw new ApiError('monid', providerStatus ?? null, run?.providerResponse?.error ?? run?.reason ?? `Monid run ${String(status ?? 'failed').toLowerCase()}`);
}

async function send(access: Access, op: Op, apolloPath: string, query = '', init: RequestInit = {}): Promise<unknown> {
  const { url, headers } = route(access, op, apolloPath, query);
  if (access.via === 'apollo') return request('apollo', url, { ...init, headers });
  if (access.via === 'monid') {
    const run = monidRun(op, apolloPath, query, typeof init.body === 'string' ? init.body : undefined);
    const first = await request('monid', url, { method: 'POST', headers, body: JSON.stringify(run) }, 30000);
    return monidResult(access.key, first);
  }
  return request('treg', url, { ...init, headers }, undefined, (h) => {
    const micro = Number(h.get('x-treg-cost-micro'));
    if (micro > 0) costListener(micro);
  });
}

/** Raw organization as returned by Apollo; kept around for "why now" fields later. */
export type ApolloOrg = Record<string, any>;

export async function checkKey(access: Access): Promise<boolean> {
  if (access.via === 'treg') return (await tregAccount(access.key)) !== null;
  if (access.via === 'monid') return monidWhoami(access.key);
  // auth/health answers 200 either way; is_logged_in tells us if the key is valid.
  const body = (await request('apollo', 'https://api.apollo.io/v1/auth/health', { headers: apolloHeaders(access.key) })) as any;
  return body?.is_logged_in === true;
}

/** The treg team behind a key (auth/me), or null if treg doesn't know the key. Free. */
async function tregAccount(key: string): Promise<{ orgId: number } | null> {
  try {
    const me = (await request('treg', `${TREG}/auth/me`, { headers: { 'X-Treg-Token': key } })) as any;
    return typeof me?.org_id === 'number' ? { orgId: me.org_id } : null;
  } catch (err) {
    if (err instanceof ApiError && err.invalidKey) return null;
    throw err;
  }
}

/** True when Monid knows the key (auth/whoami). Free. */
async function monidWhoami(key: string): Promise<boolean> {
  try {
    const me = (await request('monid', `${MONID}/v1/auth/whoami`, { headers: monidHeaders(key) })) as any;
    return !!me?.workspace;
  } catch (err) {
    if (err instanceof ApiError && err.invalidKey) return false;
    throw err;
  }
}

/**
 * Balance. Apollo: the team's credit usage (needs a master key; other keys get 403).
 * treg: the prepaid dollar balance, as { treg: { balance_usd } }. Monid: the wallet, as { monid: { balance: { value } } }.
 * All are read by parseBalance.
 */
export async function getCreditUsage(access: Access): Promise<unknown> {
  if (access.via === 'apollo') {
    return request('apollo', `${BASE}/usage_stats/credit_usage_stats`, { method: 'POST', headers: apolloHeaders(access.key) });
  }
  if (access.via === 'monid') {
    if (!(await monidWhoami(access.key))) return null;
    return { monid: await request('monid', `${MONID}/v1/wallet/balance`, { headers: monidHeaders(access.key) }) };
  }
  const account = await tregAccount(access.key);
  if (!account) return null;
  return { treg: await request('treg', `${TREG}/orgs/${account.orgId}/balance`, { headers: { 'X-Treg-Token': access.key } }) };
}

export async function enrichOrganization(access: Access, domain: string): Promise<ApolloOrg | null> {
  const body = (await send(access, 'enrich', '/organizations/enrich', `?domain=${encodeURIComponent(domain)}`)) as any;
  const org = body?.organization;
  return org && org.id ? org : null;
}

export function mapOrganization(org: ApolloOrg, domain: string): Company {
  return {
    apolloId: org.id,
    name: org.name ?? domain,
    domain: org.primary_domain ?? domain,
    logo: org.logo_url ?? null,
    industry: org.industry ?? null,
    headcount: typeof org.estimated_num_employees === 'number' ? org.estimated_num_employees : null,
    country: org.country ?? null,
    city: org.city ?? null,
    fundingStage: org.latest_funding_stage ?? null,
    totalFunding: org.total_funding_printed ?? null,
    foundedYear: org.founded_year ?? null,
    description: org.short_description ?? null,
    keywords: Array.isArray(org.keywords) ? org.keywords.slice(0, 20) : [],
    linkedin: org.linkedin_url ?? null,
  };
}

export interface JobPosting {
  title: string;
  url: string | null;
  postedAt: string | null;
  lastSeenAt: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export async function getJobPostings(access: Access, organizationId: string): Promise<JobPosting[]> {
  const id = encodeURIComponent(organizationId);
  // treg takes Apollo's path parameter as organization_id in the query (Monid as a path parameter, see monidRun).
  const body = (await send(access, 'jobs', `/organizations/${id}/job_postings`,
    access.via === 'treg' ? `?organization_id=${id}&per_page=100` : '?per_page=100')) as any;
  const jobs: any[] = Array.isArray(body?.organization_job_postings) ? body.organization_job_postings : [];
  return jobs
    .filter((j) => j?.title)
    .map((j) => ({
      title: String(j.title),
      url: j.url ?? null,
      postedAt: j.posted_at ?? null,
      lastSeenAt: j.last_seen_at ?? null,
      city: j.city ?? null,
      state: j.state ?? null,
      country: j.country ?? null,
    }));
}

/** Organization search with lookalikes and filters. 1 credit per page. */
export async function searchOrganizations(access: Access, query: object): Promise<{ organizations: any[]; totalEntries: number }> {
  const body = (await send(access, 'companies', '/mixed_companies/search', '', { method: 'POST', body: JSON.stringify(query) })) as any;
  const organizations = [...(body?.organizations ?? []), ...(body?.accounts ?? [])];
  return { organizations, totalEntries: body?.pagination?.total_entries ?? organizations.length };
}

export interface ProfileMatch {
  person: Contact;
  company: { apolloId: string | null; domain: string | null; name: string | null };
}

/** Map Apollo's people/match response (by LinkedIn URL) to a revealed contact and their company. */
export function mapProfileMatch(body: any, now = Date.now()): ProfileMatch | null {
  const p = body?.person;
  if (!p?.id) return null;
  const o = p.organization ?? {};
  const domain = (o.primary_domain ?? p.email_domain ?? '').toLowerCase() || null;
  return {
    person: {
      apolloId: p.id,
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? null,
      lastNameObfuscated: null,
      title: p.title ?? null,
      headline: p.headline ?? null,
      hasEmail: !!p.email,
      rank: null,
      email: p.email ?? null,
      emailStatus: p.email_status ?? null,
      linkedin: p.linkedin_url ?? null,
      revealedAt: now,
    },
    company: { apolloId: p.organization_id ?? o.id ?? null, domain, name: o.name ?? null },
  };
}

/** Who is on this LinkedIn profile, and where do they work? People enrichment: 1 credit when found. */
export async function matchLinkedin(access: Access, linkedinUrl: string): Promise<ProfileMatch | null> {
  const body = await send(access, 'match', '/people/match', '', {
    method: 'POST',
    body: JSON.stringify({ linkedin_url: linkedinUrl, reveal_personal_emails: false, reveal_phone_number: false }),
  });
  return mapProfileMatch(body);
}

export interface PeopleQuery {
  organizationId: string;
  titles?: string[];
  seniorities?: string[];
  /** Free-text match across the person's fields (title, department…). */
  keywords?: string;
  perPage?: number;
}

/** People API search: free, but returns obfuscated last names and no emails. */
export async function searchPeople(access: Access, q: PeopleQuery): Promise<Contact[]> {
  // Without a company filter Apollo searches everyone in its database (333k people in one test).
  if (!q.organizationId) throw new Error('People search needs a company id');
  const payload: Record<string, unknown> = {
    organization_ids: [q.organizationId],
    per_page: q.perPage ?? 15,
    page: 1,
  };
  if (q.titles?.length) payload.person_titles = q.titles;
  if (q.seniorities?.length) payload.person_seniorities = q.seniorities;
  if (q.keywords) payload.q_keywords = q.keywords;
  const body = (await send(access, 'people', '/mixed_people/api_search', '', { method: 'POST', body: JSON.stringify(payload) })) as any;
  const people: any[] = Array.isArray(body?.people) ? body.people : [];
  return people.map((p) => ({
    apolloId: p.id,
    firstName: p.first_name ?? '',
    lastName: null,
    lastNameObfuscated: p.last_name_obfuscated ?? null,
    title: p.title ?? null,
    hasEmail: p.has_email !== false,
    rank: null,
  }));
}

export interface Reveal {
  /** Apollo matched the person (and so charged a credit). */
  found: boolean;
  lastName: string | null;
  email: string | null;
  emailStatus: string | null;
  linkedin: string | null;
  title: string | null;
}

/** People enrichment by Apollo id. Spends a credit. */
export async function revealPerson(access: Access, personId: string): Promise<Reveal> {
  const body = (await send(access, 'match', '/people/match', '', {
    method: 'POST',
    body: JSON.stringify({ id: personId, reveal_personal_emails: false, reveal_phone_number: false }),
  })) as any;
  const p = body?.person ?? {};
  return {
    found: !!body?.person,
    lastName: p.last_name ?? null,
    email: p.email ?? null,
    emailStatus: p.email_status ?? null,
    linkedin: p.linkedin_url ?? null,
    title: p.title ?? null,
  };
}
