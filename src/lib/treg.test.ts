import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessFor, hasDataKey } from './access';
import { enrichOrganization, getJobPostings, onTregCost, revealPerson, route, searchPeople } from './apollo';
import { parseBalance, priceLabel } from './credits';

const treg = { via: 'treg', key: 'trg_live_x' } as const;
const direct = { via: 'apollo', key: 'ak' } as const;

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => vi.restoreAllMocks());

describe('reaching Apollo directly or through treg', () => {
  it('picks the access from the saved keys', () => {
    expect(accessFor({ apollo: 'ak', typesafe: 't' })).toEqual(direct);
    expect(accessFor({ apollo: '', typesafe: 't', provider: 'treg', treg: 'trg_live_x' })).toEqual(treg);
    expect(hasDataKey({ apollo: '', typesafe: 't', provider: 'treg', treg: 'trg_live_x' })).toBe(true);
    expect(hasDataKey({ apollo: 'ak', typesafe: 't', provider: 'treg', treg: '' })).toBe(false);
  });

  it('maps each Apollo path to its treg endpoint, with the key and a cost cap', () => {
    expect(route(direct, 'enrich', '/organizations/enrich', '?domain=a.com').url).toBe('https://api.apollo.io/api/v1/organizations/enrich?domain=a.com');
    const r = route(treg, 'enrich', '/organizations/enrich', '?domain=a.com');
    expect(r.url).toBe('https://treg.to/call/apollo.companies.enrich?domain=a.com');
    expect(r.headers).toMatchObject({ 'X-Treg-Token': 'trg_live_x', 'X-Treg-Route-Max-Cost': '0.06' });
    expect(route(treg, 'people', '/mixed_people/api_search').url).toBe('https://treg.to/call/apollo.people.search');
    expect(route(treg, 'match', '/people/match').url).toBe('https://treg.to/call/apollo.people.enrich');
    expect(route(treg, 'companies', '/mixed_companies/search').url).toBe('https://treg.to/call/apollo.companies.search');
  });

  it('sends the same body either way and reads the same response', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ people: [{ id: 'p1', first_name: 'Ana', last_name_obfuscated: 'S***h', title: 'VP Support', has_email: true }] }));
    const a = await searchPeople(direct, { organizationId: 'o1', titles: ['VP Support'] });
    const b = await searchPeople(treg, { organizationId: 'o1', titles: ['VP Support'] });
    expect(a).toEqual(b);
    expect(f.mock.calls[0]![1]!.body).toBe(f.mock.calls[1]![1]!.body);
  });

  it('passes the job postings org id as a query parameter through treg', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ organization_job_postings: [{ title: 'Support Lead' }] }));
    await getJobPostings(treg, 'org 1');
    expect(String(f.mock.calls[0]![0])).toBe('https://treg.to/call/apollo.companies.jobs?organization_id=org%201&per_page=100');
    await getJobPostings(direct, 'org1');
    expect(String(f.mock.calls[1]![0])).toBe('https://api.apollo.io/api/v1/organizations/org1/job_postings?per_page=100');
  });

  it("reports treg's exact charge, and nothing for free calls or direct Apollo", async () => {
    const seen: number[] = [];
    onTregCost((m) => seen.push(m));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ organization: { id: 'o1' } }, { 'x-treg-cost-micro': '26000' }))
      .mockResolvedValueOnce(ok({ people: [] }, { 'x-treg-cost-micro': '0' }))
      .mockResolvedValueOnce(ok({ organization: { id: 'o1' } }));
    await enrichOrganization(treg, 'a.com');
    await searchPeople(treg, { organizationId: 'o1' });
    await enrichOrganization(direct, 'a.com');
    expect(seen).toEqual([26000]);
  });

  it('explains a low treg balance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'insufficient balance' }), { status: 402 }));
    const { toLookupError, describeError } = await import('./errors');
    const err = await revealPerson(treg, 'p1').catch((e) => e);
    expect(describeError(toLookupError(err))).toMatch(/treg balance is too low/);
  });
});

describe('treg money', () => {
  it('prices credits in dollars through treg', () => {
    expect(priceLabel(2, false)).toBe('2 cr');
    expect(priceLabel(1, false, true)).toBe('1 credit');
    expect(priceLabel(2, true)).toBe('$0.052');
    expect(priceLabel(9, true, true)).toBe('$0.23');
  });

  it("reads treg's balance", () => {
    expect(parseBalance({ treg: { balance_usd: 0.6946 } }, 5)).toEqual({ available: true, usd: 0.6946, checkedAt: 5 });
    expect(parseBalance({ treg: {} }, 5)).toEqual({ available: false, checkedAt: 5 });
  });
});
