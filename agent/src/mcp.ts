/*
 * Sift as an MCP server (stdio). The tools are cheap-first and explicit about money: looking a company up
 * and listing its people never reveals an email; reveals are their own call; `quote` prices a batch first;
 * and the monthly budget is enforced inside Sift, so an agent can't spend past it (and has no tool to raise it).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SiftError, budget, getIcp, init, listContacts, quote, revealEmails, setIcp, siftCompany } from './engine';
import { VERSION } from './version';

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> });
const fail = (err: unknown) => {
  const e = err instanceof SiftError ? { error: err.code, message: err.message, ...err.details } : { error: 'internal', message: String(err instanceof Error ? err.message : err) };
  return { content: [{ type: 'text' as const, text: JSON.stringify(e, null, 2) }], isError: true };
};
const run = async (fn: () => Promise<unknown>) => {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
};

export function createServer() {
  const server = new McpServer(
    { name: 'sift', version: VERSION },
    {
      instructions: [
        'Sift qualifies companies for outbound: ICP fit (every requirement checked), why now (hiring, growth, funding, the company\'s own site, each with its source), and the people most likely to own the problem, ranked.',
        'Costs: sift_company is 2 credits for a new company and free for 7 days after; list_contacts, quote, budget and the ICP tools are free; reveal_email is 1 credit per person found. Through treg a credit is $0.026.',
        'Work cheap-first: quote a batch before running it, look companies up, and reveal emails only for people you will actually contact. Explain fit and timing with the returned checks and signals; never invent reasons.',
        'If a call fails with over_budget, stop and ask the user. Do not retry with refresh unless the user asks for fresh data.',
      ].join('\n'),
    },
  );

  server.registerTool(
    'sift_company',
    {
      title: 'Qualify a company',
      description:
        'Look up a company by domain: ICP fit score with each requirement (met / near / unsure / not met), why-now signals with evidence, the best buyer persona, and the top ranked contacts (no emails). Costs 2 credits for a new company, free if looked up in the last 7 days.',
      inputSchema: {
        domain: z.string().describe('Company domain, e.g. acme.com (a URL works too)'),
        refresh: z.boolean().optional().describe('Look it up again even if cached (costs again). Default false.'),
        max_credits: z.number().int().min(0).optional().describe('Refuse if this would cost more credits than this.'),
        contacts: z.number().int().min(0).max(30).optional().describe('How many ranked contacts to include (default 5).'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    ({ domain, refresh, max_credits, contacts }) => run(() => siftCompany(domain, { refresh, maxCredits: max_credits, contacts })),
  );

  server.registerTool(
    'list_contacts',
    {
      title: 'List ranked contacts',
      description: 'All ranked contacts Sift found for a company already looked up with sift_company (free). Use person_id with reveal_email.',
      inputSchema: { domain: z.string(), limit: z.number().int().min(1).max(30).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ domain, limit }) => run(() => listContacts(domain, limit)),
  );

  server.registerTool(
    'reveal_email',
    {
      title: 'Reveal emails',
      description:
        'Reveal verified emails for people at a company looked up with sift_company. 1 credit per person Apollo finds ($0.026 through treg); people already revealed are free. Only reveal people you will contact.',
      inputSchema: {
        domain: z.string(),
        person_ids: z.array(z.string()).min(1).max(10).describe('person_id values from sift_company or list_contacts'),
        max_credits: z.number().int().min(0).optional().describe('Refuse if this would cost more credits than this.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    ({ domain, person_ids, max_credits }) => run(() => revealEmails(domain, person_ids, max_credits)),
  );

  server.registerTool(
    'quote',
    {
      title: 'Price a batch',
      description: 'What looking up these companies (and optionally revealing some emails at each) would cost, and whether it fits the remaining budget. Free. Call this before a batch.',
      inputSchema: {
        domains: z.array(z.string()).min(1).max(500),
        reveals_per_company: z.number().int().min(0).max(10).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ domains, reveals_per_company }) => run(() => quote(domains, reveals_per_company ?? 0)),
  );

  server.registerTool(
    'budget',
    {
      title: 'Budget and balance',
      description: "This month's spend, the monthly limit, what's left, and the Apollo or treg balance where readable. Free. The limit is set by the user, not by agents.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () => run(() => budget()),
  );

  server.registerTool(
    'get_icp',
    {
      title: 'Show the ICP',
      description: 'The ideal customer profile Sift judges companies against: the seller\'s answers and the rules generated from them. Free.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => run(async () => (await getIcp()) ?? { icp: null, message: 'No ICP yet. Call set_icp.' }),
  );

  server.registerTool(
    'set_icp',
    {
      title: 'Set the ICP',
      description:
        'Describe what the user sells, their ideal customer and who buys; Sift generates the rules (company size and countries are checked exactly, everything else is judged). Clears cached results, since they were judged against the old ICP. Free.',
      inputSchema: {
        sells: z.string().describe('What the user sells, e.g. "AI support QA software for SaaS companies."'),
        icp: z.string().describe('Ideal customer, e.g. "Series A–C SaaS companies, 50–500 employees, in the US, with large support teams."'),
        buyers: z.string().describe('Who buys, comma separated, e.g. "VP Customer Experience, Head of Support, COO"'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ sells, icp, buyers }) => run(() => setIcp({ sells, icp, buyers })),
  );

  return server;
}

export async function serveStdio() {
  await init();
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
