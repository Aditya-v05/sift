// The agent package with Apollo and Jev faked: no network, no credits. Covers the money rules (budget,
// max_credits, quote, cache) and the MCP server end to end through a real MCP client.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { enrich: 0, jobs: 0, search: 0, reveal: 0 };

vi.mock('../../src/lib/apollo', async (orig) => {
  const real = await orig<typeof import('../../src/lib/apollo')>();
  return {
    ...real,
    enrichOrganization: vi.fn(async (_a: unknown, domain: string) => {
      calls.enrich++;
      return domain === 'nobody.example'
        ? null
        : { id: `org-${domain}`, name: 'Acme', primary_domain: domain, estimated_num_employees: 240, country: 'United States', industry: 'software', latest_funding_stage: 'Series B' };
    }),
    getJobPostings: vi.fn(async () => (calls.jobs++, [{ title: 'Head of Support', url: null, postedAt: null, lastSeenAt: null, city: null, state: null, country: null }])),
    searchPeople: vi.fn(async () => (calls.search++, [
      { apolloId: 'p1', firstName: 'Ingrid', lastName: null, lastNameObfuscated: 'H***m', title: 'VP Customer Experience', hasEmail: true, rank: null },
      { apolloId: 'p2', firstName: 'Jonas', lastName: null, lastNameObfuscated: 'B***g', title: 'Head of Support', hasEmail: true, rank: null },
    ])),
    revealPerson: vi.fn(async (_a: unknown, id: string) => (calls.reveal++, {
      found: true, lastName: id === 'p1' ? 'Holm' : 'Berg', email: `${id}@acme.example`, emailStatus: 'verified', linkedin: null, title: null,
    })),
    getCreditUsage: vi.fn(async () => null),
    checkKey: vi.fn(async () => true),
  };
});

// Jev answers every question confidently: yes for checks, top scores, the first persona.
vi.mock('../../src/lib/jev', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/jev')>()),
  ask: vi.fn(async (_k: string, _s: unknown, questions: Record<string, { type: string; criteria?: Record<string, string> }>) =>
    Object.fromEntries(
      Object.entries(questions).map(([id, q]) => [
        id,
        q.type === 'noul' ? { type: 'noul', noul: 0.9 }
          : q.type === 'choice' ? { type: 'choice', choice: Object.keys(q.criteria ?? {})[0] ?? 'none', confidence: 0.9, probabilities: {} }
            : { type: 'score', score: 0.85, confidence: 0.9 },
      ]),
    )),
}));

vi.mock('../src/site-node', () => ({ readSiteNode: vi.fn(async () => null) }));

const ICP = {
  sells: 'AI support QA software for SaaS companies.',
  icp: 'Series A–C SaaS companies, 50–500 employees, based in the US, with large customer support teams.',
  buyers: 'VP Customer Experience, Head of Support',
};

async function fresh(env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'sift-'));
  process.env.SIFT_HOME = home;
  vi.resetModules();
  const nb = await import('../src/node-browser');
  nb.resetNodeBrowser();
  const engine = await import('../src/engine');
  engine.resetEngine();
  await engine.init({ APOLLO_KEY: 'ak', TYPESAFE_KEY: 'tk', ...env });
  return { engine, home, nb };
}

beforeEach(() => Object.assign(calls, { enrich: 0, jobs: 0, search: 0, reveal: 0 }));

describe('engine', () => {
  it('needs an ICP and says how to set one', async () => {
    const { engine } = await fresh();
    await expect(engine.siftCompany('acme.example')).rejects.toMatchObject({ code: 'missing_icp' });
  });

  it('needs keys and names the environment variables', async () => {
    const { engine } = await fresh();
    engine.resetEngine();
    await engine.init({});
    await expect(engine.siftCompany('acme.example')).rejects.toThrow(/TYPESAFE_KEY.*APOLLO_KEY, TREG_KEY .*or MONID_KEY/);
  });

  it('picks the data source from the keys it is given, or from SIFT_PROVIDER', async () => {
    const { engine, nb } = await fresh();
    const provider = async (env: Record<string, string>) => {
      engine.resetEngine();
      await engine.init({ TYPESAFE_KEY: 't', ...env });
      return (await nb.browser.storage.local.get('keys')).keys;
    };
    expect(await provider({ MONID_KEY: 'monid_live_x' })).toMatchObject({ provider: 'monid', monid: 'monid_live_x' });
    expect((await provider({ APOLLO_KEY: 'ak', MONID_KEY: 'monid_live_x' })).provider).toBe('apollo');
    expect((await provider({ APOLLO_KEY: 'ak', MONID_KEY: 'monid_live_x', SIFT_PROVIDER: 'monid' })).provider).toBe('monid');
    expect((await provider({ TREG_KEY: 'trg', MONID_KEY: 'monid_live_x' })).provider).toBe('treg');
  });

  it('qualifies a company, explains itself, and serves repeats from the cache for free', async () => {
    const { engine } = await fresh();
    await engine.setIcp(ICP);
    const r = await engine.siftCompany('https://www.acme.example/pricing');
    expect(r.domain).toBe('acme.example');
    expect(r.fit?.checks.map((c) => c.state)).toEqual(['met', 'met', 'met', 'met']);
    expect(r.contacts[0]).toMatchObject({ person_id: expect.any(String), name: expect.any(String) });
    expect(r.contacts[0]).not.toHaveProperty('email'); // never revealed by a lookup
    expect(r.cost).toEqual({ credits: 2, usd: null, cached: false });
    const again = await engine.siftCompany('acme.example');
    expect(again.cost).toEqual({ credits: 0, usd: null, cached: true });
    expect(calls.enrich).toBe(1);
  });

  it('refuses past max_credits and past the monthly budget, before spending', async () => {
    const { engine } = await fresh({ SIFT_BUDGET: '3' });
    await engine.setIcp(ICP);
    await expect(engine.siftCompany('a.example', { maxCredits: 1 })).rejects.toMatchObject({ code: 'over_max' });
    expect(calls.enrich).toBe(0);
    await engine.siftCompany('a.example'); // 2 of 3
    await expect(engine.siftCompany('b.example')).rejects.toMatchObject({ code: 'over_budget' });
    expect(calls.enrich).toBe(1);
  });

  it('prices a batch with quote, counting the cache', async () => {
    const { engine } = await fresh({ SIFT_BUDGET: '5' });
    await engine.setIcp(ICP);
    await engine.siftCompany('a.example');
    const q = await engine.quote(['a.example', 'b.example', 'c.example', 'not a domain'], 1);
    expect(q.companies.map((c) => c.credits)).toEqual([1, 3, 3, 0]);
    expect(q.total.credits).toBe(7);
    expect(q.budget.fits).toBe(false); // 2 spent + 7 > 5
  });

  it('reveals only known people, charges once, and remembers', async () => {
    const { engine } = await fresh();
    await engine.setIcp(ICP);
    const r = await engine.siftCompany('acme.example');
    const id = r.contacts[0]!.person_id;
    await expect(engine.revealEmails('acme.example', ['nope'])).rejects.toMatchObject({ code: 'not_found' });
    const first = await engine.revealEmails('acme.example', [id]);
    expect(first.people[0]).toMatchObject({ email: `${id}@acme.example`, email_status: 'verified' });
    expect(first.cost.credits).toBe(1);
    const second = await engine.revealEmails('acme.example', [id]);
    expect(second).toMatchObject({ already_revealed: 1, cost: { credits: 0 } });
    expect(calls.reveal).toBe(1);
  });

  it('prices in dollars through treg', async () => {
    const { engine } = await fresh({ TREG_KEY: 'trg_live_x', APOLLO_KEY: '' });
    await engine.setIcp(ICP);
    const q = await engine.quote(['acme.example']);
    expect(q.total).toEqual({ credits: 2, usd: 0.052 });
    expect((await engine.budget()).provider).toBe('treg');
  });

  it('never writes keys to disk', async () => {
    const { engine, home } = await fresh({ APOLLO_KEY: 'secret-apollo', TYPESAFE_KEY: 'secret-jev' });
    await engine.setIcp(ICP);
    await engine.siftCompany('acme.example');
    const disk = readFileSync(join(home, 'store.json'), 'utf8');
    expect(disk).not.toContain('secret-apollo');
    expect(disk).not.toContain('secret-jev');
    expect(disk).toContain('acme.example');
  });
});

describe('MCP server', () => {
  async function connect(env: Record<string, string> = {}) {
    await fresh(env);
    const { createServer } = await import('../src/mcp');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(a);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      return { error: !!res.isError, data: JSON.parse(res.content[0]!.text) };
    };
    return { client, call };
  }

  it('lists the tools, with no way for an agent to raise its own budget', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['budget', 'get_icp', 'list_contacts', 'quote', 'reveal_email', 'set_icp', 'sift_company']);
  });

  it('runs a whole agent flow: ICP, quote, qualify, list, reveal, budget', async () => {
    const { call } = await connect({ SIFT_BUDGET: '10' });
    expect((await call('set_icp', ICP)).data.rules.personas).toEqual(['VP Customer Experience', 'Head of Support']);
    expect((await call('quote', { domains: ['acme.example'] })).data.total.credits).toBe(2);
    const company = (await call('sift_company', { domain: 'acme.example', contacts: 1 })).data;
    expect(company.fit.verdict).toBe('strong');
    expect(company.contacts).toHaveLength(1);
    const list = (await call('list_contacts', { domain: 'acme.example' })).data;
    expect(list.contacts_total).toBe(2);
    const rev = (await call('reveal_email', { domain: 'acme.example', person_ids: [list.contacts[0].person_id] })).data;
    expect(rev.people[0].email).toMatch(/@acme\.example$/);
    const b = (await call('budget')).data;
    expect(b.spent.credits).toBe(3);
    expect(b.remaining.credits).toBe(7);
  });

  it('returns errors as structured tool errors an agent can act on', async () => {
    const { call } = await connect({ SIFT_BUDGET: '1' });
    await call('set_icp', ICP);
    const res = await call('sift_company', { domain: 'acme.example' });
    expect(res.error).toBe(true);
    expect(res.data).toMatchObject({ error: 'over_budget', needed: 2 });
    expect(res.data.message).toMatch(/Ask the user/);
    const bad = await call('sift_company', { domain: 'not a domain' });
    expect(bad.data.error).toBe('bad_domain');
  });
});
