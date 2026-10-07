/*
 * Website signals outside the browser. The extension's reader (scanSite) is self-contained so it can be
 * injected into a tab; here the same function runs against a happy-dom page loaded with the company's
 * homepage, with that page's location, document and DOMParser, and Node's fetch, passed in as its globals.
 * Some sites block plain requests: then the lookup says the website wasn't read, as the extension can.
 */
import { Window } from 'happy-dom';
import { scanSite, type SiteScan } from '../../src/lib/site-scan';
import { registrableDomain } from '../../src/lib/resolver';

const UA = 'Mozilla/5.0 (compatible; Sift/0.1; +https://sift-through.vercel.app)';

/** fetch with a browser-like accept header, a timeout, and only same-site HTML. */
function siteFetch(timeoutMs: number): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', ...(init?.headers ?? {}) },
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      credentials: undefined,
    })) as typeof fetch;
}

export async function readSiteNode(domain: string, { timeoutMs = 8000, maxPages = 5 } = {}): Promise<SiteScan | null> {
  const f = siteFetch(timeoutMs);
  let res: Response;
  try {
    res = await f(`https://${domain}/`, { redirect: 'follow' });
  } catch {
    return null;
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
  const html = await res.text();
  const url = res.url || `https://${domain}/`;
  // A redirect to another company (acquired, parked) isn't this company's site.
  if (registrableDomain(new URL(url).hostname.toLowerCase()) !== domain) return null;

  const window = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, navigator: { userAgent: UA } },
  });
  try {
    window.document.write(html);
    // Run the reader with this page as its world (the same source the extension injects into a tab).
    const run = new Function('location', 'document', 'DOMParser', 'fetch', `return (${scanSite.toString()})(${maxPages});`) as (
      ...a: unknown[]
    ) => Promise<SiteScan>;
    const scan = await run(window.location, window.document, window.DOMParser, f);
    return registrableDomain(scan.host.toLowerCase()) === domain ? scan : null;
  } catch {
    return null;
  } finally {
    await window.happyDOM.close();
  }
}
