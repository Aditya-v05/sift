import { describe, expect, it } from 'vitest';
import { checkKey, enrichOrganization, getCreditUsage, getJobPostings, onGatewayCost, revealPerson, searchPeople } from './apollo';
import { parseBalance } from './credits';

/*
 * Sift's own Apollo calls, live through Monid. Costs about $0.08 from the key's Monid wallet
 * (enrich, job postings and one people/match at $0.026; people search, key check and balance are free).
 * Run: MONID_KEY=monid_live_... npx vitest run src/lib/monid.live.test.ts
 */
const key = process.env.MONID_KEY;

describe.skipIf(!key)('Monid, live', () => {
  const access = { via: 'monid', key: key! } as const;
  const charges: number[] = [];
  onGatewayCost((m) => charges.push(m));

  it('checks the key and reads the wallet', async () => {
    expect(await checkKey(access)).toBe(true);
    expect(await checkKey({ via: 'monid', key: 'monid_live_not_a_key' })).toBe(false);
    const balance = parseBalance(await getCreditUsage(access));
    expect(balance.available && 'usd' in balance && balance.usd >= 0).toBe(true);
  });

  it('looks up a company, its people and jobs, reveals one person, and records each charge', async () => {
    const org = await enrichOrganization(access, 'usepylon.com');
    expect(org?.id).toBeTruthy();
    const people = await searchPeople(access, { organizationId: org!.id, seniorities: ['head', 'director', 'vp', 'founder', 'c_suite'] });
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]!.lastNameObfuscated).toBeTruthy();
    const jobs = await getJobPostings(access, org!.id);
    expect(jobs.length).toBeGreaterThan(0);
    const target = people.find((p) => p.hasEmail) ?? people[0]!;
    const r = await revealPerson(access, target.apolloId); // answers 202 and is polled
    expect(r.found).toBe(true);
    expect(charges).toEqual([26000, 26000, 26000]); // enrich, jobs, match; people search is free
  }, 90000);
});
