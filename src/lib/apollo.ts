import { ApiError, request } from './errors';
import type { Company, Contact } from './types';

const BASE = 'https://api.apollo.io/api/v1';

/*
 * Sift reaches Apollo one of two ways: directly with the user's Apollo key, or through treg (treg.to) with
 * the user's treg key. treg's apollo.* endpoints pass Apollo's method, query and body through unchanged and
 * return Apollo's response verbatim, so everything after the request (mapping, ranking, caching) is shared.
 * Verified live on 2026-10-06: search (free), enrich, job postings, lookalike search and people/match.
 */
import type { Access } from './access';
export type { Access } from './access';

const TREG = 'https://treg.to';
/** treg's price for one Apollo credit (catalog, Oct 2026): every paid Apollo call costs $0.026. */
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

/** Exact dollars treg charged (micro-USD, from X-Treg-Cost-Micro). The background records it in the ledger. */
let costListener: (usdMicro: number) => void = () => {};
export function onTregCost(fn: (usdMicro: number) => void): void {
  costListener = fn;
}

function apolloHeaders(key: string): HeadersInit {
  return { 'X-Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
}

function tregHeaders(key: string): HeadersInit {
  return { 'X-Treg-Token': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Treg-Route-Max-Cost': TREG_MAX_COST };
}

/** The same Apollo request, sent directly or through treg. `query` starts with '?' or is empty. */
export function route(access: Access, op: Op, apolloPath: string, query = ''): { url: string; headers: HeadersInit } {
  return access.via === 'treg'
    ? { url: `${TREG}/call/${TREG_ENDPOINT[op]}${query}`, headers: tregHeaders(access.key) }
    : { url: `${BASE}${apolloPath}${query}`, headers: apolloHeaders(access.key) };
}

async function send(access: Access, op: Op, apolloPath: string, query = '', init: RequestInit = {}): Promise<unknown> {
  const { url, headers } = route(access, op, apolloPath, query);
  if (access.via === 'apollo') return request('apollo', url, { ...init, headers });
  return request('treg', url, { ...init, headers }, undefined, (h) => {
    const micro = Number(h.get('x-treg-cost-micro'));
    if (micro > 0) costListener(micro);
  });
}

/** Raw organization as returned by Apollo; kept around for "why now" fields later. */
export type ApolloOrg = Record<string, any>;

export async function checkKey(access: Access): Promise<boolean> {
  if (access.via === 'treg') return (await tregAccount(access.key)) !== null;
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

/**
 * Balance. Apollo: the team's credit usage (needs a master key; other keys get 403).
 * treg: the prepaid dollar balance, as { treg: { balance_usd } }. Both are read by parseBalance.
 */
export async function getCreditUsage(access: Access): Promise<unknown> {
  if (access.via === 'apollo') {
    return request('apollo', `${BASE}/usage_stats/credit_usage_stats`, { method: 'POST', headers: apolloHeaders(access.key) });
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
  // treg takes Apollo's path parameter as organization_id in the query.
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
