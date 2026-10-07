import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessFor, hasDataKey } from './access';
import { checkKey, enrichOrganization, getCreditUsage, getJobPostings, monidRun, onGatewayCost, revealPerson, route, searchOrganizations, searchPeople } from './apollo';
import { balanceIsFor, parseBalance } from './credits';
import { describeError, toLookupError } from './errors';

/*
 * Monid as a data source, with fetch mocked. The response shapes are the ones Monid returned live on
 * 2026-10-08 (see monid.live.test.ts): a run envelope with Apollo's response in `output`.
 */
const monid = { via: 'monid', key: 'monid_live_x' } as const;

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const run = (output: unknown, micro = 26000, extra: Record<string, unknown> = {}) => ({
  runId: 'r1', provider: 'apollo', status: 'COMPLETED', output, providerResponse: { httpStatus: 200 },
  billing: { reportedCost: { currency: 'USD', value: micro, unit: 'MICRO_DOLLAR' } }, ...extra,
});
const sentRun = (f: ReturnType<typeof vi.spyOn>, i = 0) => JSON.parse(String((f.mock.calls[i]![1] as RequestInit).body));

afterEach(() => vi.restoreAllMocks());

describe('reaching Apollo through Monid', () => {
  it('picks Monid from the saved keys', () => {
    expect(accessFor({ apollo: 'ak', typesafe: 't', provider: 'monid', monid: 'monid_live_x' })).toEqual(monid);
    expect(hasDataKey({ apollo: 'ak', typesafe: 't', provider: 'monid', monid: '' })).toBe(false);
  });

  it('sends every call as a run, with the key as a bearer token', () => {
    const r = route(monid, 'enrich', '/organizations/enrich', '?domain=a.com');
    expect(r.url).toBe('https://api.monid.ai/v1/run');
    expect(r.headers).toMatchObject({ Authorization: 'Bearer monid_live_x' });
  });

  it("puts Apollo's query and body in queryParams, arrays as key[], and the org id as a path parameter", () => {
    expect(monidRun('enrich', '/organizations/enrich', '?domain=a.com')).toEqual({
      provider: 'apollo', endpoint: '/organizations/enrich', input: { queryParams: { domain: 'a.com' } },
    });
    expect(monidRun('jobs', '/organizations/org%201/job_postings', '?per_page=100')).toEqual({
      provider: 'apollo', endpoint: '/organizations/{organization_id}/job_postings',
      input: { queryParams: { per_page: 100 }, pathParams: { organization_id: 'org 1' } },
    });
    const people = monidRun('people', '/mixed_people/api_search', '', JSON.stringify({ organization_ids: ['o1'], per_page: 15, page: 1, q_keywords: 'support' }));
    expect(people.input.queryParams).toEqual({ 'organization_ids[]': ['o1'], per_page: 15, page: 1, q_keywords: 'support' });
    const match = monidRun('match', '/people/match', '', JSON.stringify({ id: 'p1', reveal_personal_emails: false, reveal_phone_number: false }));
    expect(match.input.queryParams).toEqual({ id: 'p1', reveal_personal_emails: false, reveal_phone_number: false });
  });

  it("reads Apollo's answer out of the run and records the exact charge", async () => {
    const seen: number[] = [];
    onGatewayCost((m) => seen.push(m));
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(run({ organization: { id: 'o1', name: 'Pylon' } })))
      .mockResolvedValueOnce(ok(run({ people: [{ id: 'p1', first_name: 'Ana', last_name_obfuscated: 'S***h', title: 'VP Support', has_email: true }], total_entries: 1 }, 0)))
      .mockResolvedValueOnce(ok(run({ organization_job_postings: [{ title: 'Support Lead', url: null }], pagination: { total_entries: 1 } })));
    expect((await enrichOrganization(monid, 'a.com'))?.name).toBe('Pylon');
    const people = await searchPeople(monid, { organizationId: 'o1' });
    expect(people[0]).toMatchObject({ apolloId: 'p1', lastNameObfuscated: 'S***h' });
    expect((await getJobPostings(monid, 'o1'))[0]!.title).toBe('Support Lead');
    expect(seen).toEqual([26000, 26000]); // people search is free
    expect(sentRun(f, 0)).toMatchObject({ endpoint: '/organizations/enrich', input: { queryParams: { domain: 'a.com' } } });
  });

  it('polls a run that answers 202, and reads the charge of the finished run', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    onGatewayCost((m) => seen.push(m));
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ runId: 'r9', status: 'RUNNING' }, 202))
      .mockResolvedValueOnce(ok({ runId: 'r9', status: 'RUNNING' }))
      .mockResolvedValueOnce(ok({ runId: 'r9', status: 'COMPLETED', providerResponse: { httpStatus: 200 }, cost: { value: 0.026, currency: 'USD' },
        output: { person: { id: 'p1', last_name: 'Smith', email: 'ana@example.com', email_status: 'verified' } } }));
    const pending = revealPerson(monid, 'p1');
    await vi.runAllTimersAsync();
    const r = await pending;
    vi.useRealTimers();
    expect(r).toMatchObject({ found: true, lastName: 'Smith', email: 'ana@example.com' });
    expect(String(f.mock.calls[1]![0])).toBe('https://api.monid.ai/v1/runs/r9');
    expect(seen).toEqual([26000]);
  });

  it('falls back to the listed price when a just-finished run has no cost yet', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    onGatewayCost((m) => seen.push(m));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ runId: 'r9', status: 'RUNNING' }, 202))
      .mockResolvedValueOnce(ok({ runId: 'r9', status: 'COMPLETED', providerResponse: { httpStatus: 200 }, billedUnits: 1,
        price: { type: 'TIERED', amount: { value: 0.026, currency: 'USD' } }, output: { person: { id: 'p1' } } }));
    const pending = revealPerson(monid, 'p1');
    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();
    expect(seen).toEqual([26000]);
  });

  it("treats an unmatched company as not found, and an Apollo error inside a run as that error", async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(run({}, 0, { billedUnits: 0 })))
      .mockResolvedValueOnce(ok(run(null, 0, { status: 'FAILED', providerResponse: { httpStatus: 422, error: 'bad id' } })));
    expect(await enrichOrganization(monid, 'nope.example')).toBeNull();
    const err = await revealPerson(monid, 'p1').catch((e) => e);
    expect(toLookupError(err)).toMatchObject({ service: 'monid', status: 422, message: 'bad id' });
  });

  it("says Discover needs another source, without spending anything", async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    const err = await searchOrganizations(monid, { lookalike_organization_ids: ['o1'], per_page: 5 }).catch((e) => e);
    expect(describeError(toLookupError(err))).toMatch(/lookalikes isn't available through Monid/);
    expect(f).not.toHaveBeenCalled();
  });

  it('checks the key with whoami and reads the wallet', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ user: { userId: 'u' }, workspace: { workspaceId: 'w' } }))
      .mockResolvedValueOnce(ok({ code: 401, message: 'Invalid API key format' }, 401))
      .mockResolvedValueOnce(ok({ user: {}, workspace: { workspaceId: 'w' } }))
      .mockResolvedValueOnce(ok({ balance: { value: 0.922, currency: 'USD' }, held: { value: 0, currency: 'USD' } }));
    expect(await checkKey(monid)).toBe(true);
    expect(await checkKey({ via: 'monid', key: 'monid_live_nope' })).toBe(false);
    const balance = parseBalance(await getCreditUsage(monid), 5);
    expect(balance).toEqual({ available: true, usd: 0.922, checkedAt: 5, gateway: 'monid' });
    expect(balanceIsFor(balance, 'monid')).toBe(true);
    expect(balanceIsFor(balance, 'treg')).toBe(false);
    expect(balanceIsFor(balance, null)).toBe(false);
  });

  it('explains a low Monid balance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ code: 402, message: 'insufficient balance' }, 402));
    const err = await enrichOrganization(monid, 'a.com').catch((e) => e);
    expect(describeError(toLookupError(err))).toMatch(/Monid balance is too low/);
  });
});
