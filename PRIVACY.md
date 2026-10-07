# Sift privacy policy

_Last updated: 2026-09-29_

Sift is an open-source Chrome extension. The extension has **no server, no account and no analytics**. The developers of Sift
never receive your data.

## What Sift stores, and where

Everything is stored locally in your browser (`chrome.storage.local` and `chrome.storage.session`) and never synced:

- your Apollo and TypeSafe API keys;
- your profile (what you sell, your ideal customer, buyer titles and search preferences);
- lookup results for companies you look up (cached for 7 days), accounts you save, and your notes and statuses;
- emails you reveal;
- a count of Apollo credits Sift has spent this month, and your optional monthly budget.

Removing the extension deletes all of it.

## What Sift sends, and to whom

Sift talks to exactly two services, using **your own** API keys:

| Service | When | What is sent |
|---|---|---|
| **Apollo** (`api.apollo.io`) | when you look up a company, reveal an email, use Discover, check your credit balance, or click Sift on a LinkedIn profile | the company's domain or Apollo ID, the people or companies to look up, your search filters, and the address of the LinkedIn profile you clicked on |
| **TypeSafe** (`api.typesafe.ai`), the Jev model | during a lookup | your profile text, the company's public details from Apollo, public job titles, and short public text snippets from the company's own website |

Their handling of that data is governed by their own privacy policies and your agreements with them.

## LinkedIn

On a LinkedIn profile, Sift uses only the page's address: it sends it to Apollo to find out who the person is and where they
work. It does not read, copy or store anything from LinkedIn's pages.

## Website access

Sift reads a website only when you click its icon (or press its shortcut) on that site. It then reads the page you're on and
the same site's public pricing, blog, changelog and security pages, and sends short snippets from them to TypeSafe for
labelling. You can turn this off in Settings. Sift never reads other tabs, your browsing history, or pages you don't click on.

The panel's **Sift this page** button looks up the tab you're on without going back to the icon. The first time you press it,
Chrome asks you to allow the optional `tabs` permission (Chrome words it as "read your browsing history"). Sift uses it only to
read the active tab's address at the moment you press the button. Switching tabs is noticed (so the panel can offer the button)
but no address is read. Lookups started this way skip the website scan, because Chrome only lets extensions read a page after its
icon is clicked. You can remove the permission any time at chrome://extensions.

## Permissions

- `activeTab`, `scripting`: read the current tab's address and that site's public pages, only when you click the icon.
- `tabs` (optional, asked for on first use of Sift this page): read the active tab's address when you press that button.
- `sidePanel`: show results next to the page.
- `storage`: keep the data listed above in your browser.
- Host access to `api.apollo.io`, `api.typesafe.ai` and, if you choose treg or Monid as the data source, `treg.to` or `api.monid.ai` only.

**If you choose treg:** your lookups go to treg.to, which forwards them to Apollo and returns Apollo's answer. treg sees the same requests Apollo would (company domains, people searches, the people you reveal) and bills your treg account. Your treg key is kept in this browser like the other keys.

**If you choose Monid:** your lookups go to api.monid.ai, which runs them against Apollo and returns Apollo's answer. Monid sees the same requests Apollo would (company domains, people searches, the people you reveal) and bills your Monid wallet. Your Monid key is kept in this browser like the other keys.

## The website

The Sift website (sift-through.vercel.app) uses Vercel Web Analytics to count page views and see where visitors come from. It sets no cookies and records no personal data; Vercel aggregates visits without identifying you. This applies to the website only. The extension sends nothing to Sift or Vercel.

## Contact

Open an issue at <https://github.com/Aditya-v05/sift/issues>.
