import { describe, expect, it } from 'vitest';
import { checkKey, enrichOrganization, getCreditUsage, getJobPostings, onTregCost, searchOrganizations, searchPeople } from './apollo';
import { parseBalance } from './credits';

/*
 * Sift's own Apollo calls, live through treg. Costs about $0.08 from the key's treg balance
 * (enrich, job postings and one lookalike page at $0.026; people search, key check and balance are free).
 * Run: TREG_TOKEN=trg_live_... npx vitest run src/lib/treg.live.test.ts
 */
const token = process.env.TREG_TOKEN;

describe.skipIf(!token)('treg, live', () => {
  const access = { via: 'treg', key: token! } as const;
  const charges: number[] = [];
  onTregCost((m) => charges.push(m));

  it('checks the key and reads the balance', async () => {
    expect(await checkKey(access)).toBe(true);
    expect(await checkKey({ via: 'treg', key: 'trg_live_not_a_key' })).toBe(false);
    const balance = parseBalance(await getCreditUsage(access));
    expect(balance.available && 'usd' in balance && balance.usd >= 0).toBe(true);
  });

  it('looks up a company, its people, jobs and lookalikes, and records each charge', async () => {
    const org = await enrichOrganization(access, 'usepylon.com');
    expect(org?.id).toBeTruthy();
    const people = await searchPeople(access, { organizationId: org!.id, seniorities: ['head', 'director', 'vp'] });
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]!.lastNameObfuscated).toBeTruthy(); // the free search, as from Apollo directly
    const jobs = await getJobPostings(access, org!.id);
    expect(jobs.length).toBeGreaterThan(0);
    const { organizations } = await searchOrganizations(access, { lookalike_organization_ids: [org!.id], per_page: 5, page: 1 });
    expect(organizations.length).toBeGreaterThan(0);
    expect(charges).toEqual([26000, 26000, 26000]); // enrich, jobs, lookalikes; people search is free
  }, 60000);
});
