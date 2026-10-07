import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ContactPicker } from '@/components/ContactPicker';
import { FitCard, ProfileCard, WhyNowCard } from '@/entrypoints/sidepanel/App';
import type { LookupResult } from '@/lib/types';
import icon48 from '../public/icon/48.png';
import { SlatWord } from './SlatWord';
import { acme, acmeRevealed } from './demo-data';

const REPO = 'https://github.com/Aditya-v05/sift';
const INSTALL = `${REPO}#install`;
const PRIVACY = `${REPO}/blob/main/PRIVACY.md`;
const LOG = `${REPO}/blob/main/log.md`;
const MAKER = 'https://github.com/Aditya-v05';
const PORTFOLIO = 'https://aditya-venkatesan-gtm.vercel.app/';
const EMAIL = 'adityaspark05@gmail.com';
const ISSUES = `${REPO}/issues`;

// three.js is most of the page's script; load it after the text has painted.
const fx = () => import('./fx');
const LazyBlinds = lazy(() => fx().then((m) => ({ default: m.Blinds })));
const LazySlats = lazy(() => fx().then((m) => ({ default: m.Slats })));

/** Sections fade up as they enter the viewport, once. */
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { rootMargin: '0px 0px -12% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  useReveal();
  return (
    <div className="l-page">
      <Nav />
      <main id="top">
        <Hero />
        <section id="demo" className="l-demo-wrap l-wrap" data-reveal>
          <Eyebrow label="A real lookup, recorded" />
          <h2 className="l-demo-title">One click on their homepage. <em>The answer beside it.</em></h2>
          <DemoVideo />
        </section>
        <Answers />
        <After />
        <Costs />
        <Privacy />
        <Faq />
      </main>
      <End />
    </div>
  );
}

/** Section label: the sieve glyph, the question, and (for the answers) the score the card below shows. */
export function Eyebrow({ label, score, dark }: { label: string; score?: string; dark?: boolean }) {
  return (
    <p className={`l-eyebrow ${dark ? 'dark' : ''}`}>
      <i className="l-glyph" aria-hidden /> {label}
      {score && <b>{score}</b>}
    </p>
  );
}

// ---------- nav: a full-width bar; a mint line reads how far down the page you are ----------

/** An arrow that slides out and back in when its link is hovered or focused. */
export function Arrow({ down }: { down?: boolean }) {
  return <span className={`l-arr ${down ? 'down' : ''}`} aria-hidden><i>{down ? '↓' : '→'}</i></span>;
}

const NAV_LINKS = [
  { href: '/#answers', label: 'How it works' },
  { href: '/#costs', label: 'Costs' },
  { href: '/agents', label: 'Agents' },
  { href: REPO, label: 'GitHub' },
];

/** Which nav link the reader is in: /agents is its own page; on home, the section under the top third of the screen. */
function spy(): string | null {
  if (location.pathname.startsWith('/agents')) return '/agents';
  const y = window.innerHeight * 0.35;
  const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
  if (top('costs') <= y && top('privacy') > y) return '/#costs';
  if (top('answers') <= y && top('costs') > y) return '/#answers';
  return null;
}

/** Shared with /agents: section links point at the home page (`/#…`), which scrolls in place when already there. */
// The announcement over the nav. Change `id` with the message so a visitor who closed the old one sees the new one.
const ANNOUNCE = {
  id: 'gateways-2026-10',
  label: 'New',
  text: 'No Apollo plan? Sift now runs on treg and Monid, at $0.026 a call.',
  href: '/#costs',
  cta: 'See costs',
};
const ANNOUNCE_KEY = 'sift-announce-closed';

function Announce({ hidden }: { hidden: boolean }) {
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(ANNOUNCE_KEY) === ANNOUNCE.id;
    } catch {
      return false;
    }
  });
  if (closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(ANNOUNCE_KEY, ANNOUNCE.id);
    } catch {
      /* private window: it just comes back next visit */
    }
  };
  return (
    <div className={`l-announce ${hidden ? 'away' : ''}`} role="region" aria-label="Announcement">
      <a href={ANNOUNCE.href}>
        <span className="l-announce-tag">{ANNOUNCE.label}</span>
        <span className="l-announce-text">{ANNOUNCE.text}</span>
        <span className="l-announce-cta">{ANNOUNCE.cta}<i aria-hidden>→</i></span>
      </a>
      <button type="button" aria-label="Close announcement" onClick={close}>×</button>
    </div>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const line = useRef<HTMLSpanElement>(null);
  const links = useRef<HTMLElement>(null);
  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.6);
      setActive(spy());
      const max = document.documentElement.scrollHeight - window.innerHeight;
      line.current?.style.setProperty('transform', `scaleX(${max > 0 ? window.scrollY / max : 0})`);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => (window.removeEventListener('scroll', on), window.removeEventListener('resize', on));
  }, []);
  // One indicator slides to the link for the section in view, and fades out between sections.
  const [bar, setBar] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const el = links.current?.querySelector<HTMLElement>('a[aria-current]');
      setBar((b) => (el ? { width: el.offsetWidth, transform: `translateX(${el.offsetLeft}px)`, opacity: 1 } : { ...b, opacity: 0 }));
    };
    place();
    document.fonts?.ready.then(place);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);
  return (
    <header className={`l-nav ${scrolled ? 'scrolled' : ''}`}>
      <Announce hidden={scrolled} />
      <div className="l-nav-in">
        <a className="l-brand" href="/#top">
          <img src={icon48} alt="" width="24" height="24" />
          Sift
        </a>
        <nav ref={links}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} aria-current={active === l.href ? (l.href === '/agents' ? 'page' : 'location') : undefined}>{l.label}</a>
          ))}
          <span className="l-navbar" style={bar} aria-hidden />
        </nav>
        <a className="l-pill" href={INSTALL}>Install</a>
      </div>
      <span className="l-progress" ref={line} aria-hidden />
    </header>
  );
}

// ---------- demo: the showreel cut (video/src/Reel.tsx) around a real screen recording of usepylon.com; the revealed email is swapped for a made-up one ----------

function DemoVideo() {
  // Autoplay only when motion is welcome; otherwise show the poster with controls.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Phones get a cut cropped to the panel, where the answer is; the full window would be too small to read.
  const [phone] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  return (
    <div className={`l-video ${phone ? 'phone' : ''}`}>
      <video
        src={phone ? '/demo-m.mp4' : '/demo.mp4'}
        poster={phone ? '/demo-m-poster.jpg' : '/demo-poster.jpg'}
        width={phone ? 720 : 1600}
        height={900}
        muted
        loop
        playsInline
        autoPlay={!still}
        controls={still}
        preload="metadata"
        aria-label="Sift on usepylon.com: one click on the Sift icon, an 82% fit against the ICP, timing 75, and the best contact with a verified email"
      />
    </div>
  );
}

// ---------- hero: the line, one button, and SIFT spelled in slats across the bottom ----------

function Hero() {
  const copy = useRef<HTMLDivElement>(null);
  return (
    <section className="l-hero">
      <SlatWord quiet={copy} />
      <div className="l-hero-copy" ref={copy}>
        <h1>
          Sift through companies.<br /><em>Talk to the right ones.</em>
        </h1>
        <p className="l-lede">
          Open any company's site and Sift tells you if it fits, why now, and who to reach. One click, on your own Apollo
          (or treg, or Monid) and Jev keys.
        </p>
        <div className="l-ctas">
          <a className="l-btn cream" href={INSTALL}>Install Sift <Arrow /></a>
        </div>
        <p className="l-fine">Free and open source · <a className="l-new" href="/agents">New: Sift for AI agents (MCP) <Arrow /></a></p>
      </div>
    </section>
  );
}

// ---------- the four answers, each shown with the real panel part ----------

const fromProfile: LookupResult = {
  ...acmeRevealed,
  profile: { apolloId: 'p2', url: 'https://www.linkedin.com/in/jonas-berg' },
  contacts: acmeRevealed.contacts!.map((c) =>
    c.apolloId === 'p2' ? { ...c, lastName: 'Berg', headline: 'Head of Support at Acme', email: 'jonas.berg@acme.example', emailStatus: 'verified', revealedAt: Date.now() } : c,
  ),
};
const noop = async () => ({ revealed: 0, noEmail: 0, failed: 0, error: null });

function Answer({ score, eyebrow, title, children, visual, tint, flip }: {
  score: string; eyebrow: string; title: ReactNode; children: ReactNode; visual: ReactNode; tint: string; flip?: boolean;
}) {
  return (
    <article className={`l-answer ${flip ? 'flip' : ''}`} data-reveal>
      <div className="l-answer-copy">
        <Eyebrow label={eyebrow} score={score} />
        <h2>{title}</h2>
        {children}
      </div>
      <div className={`l-stagecard ${tint}`}>{visual}</div>
    </article>
  );
}

function Answers() {
  return (
    <section id="answers" className="l-answers l-wrap">
      <div className="l-section-head" data-reveal>
        <Eyebrow label="How it works" />
        <h2>One click. <em>Four answers.</em></h2>
        <p>The side panel reads the company for you while you're still on their homepage. These are its real parts.</p>
      </div>

      <Answer
        score="90" eyebrow="Does it fit?" tint="mint"
        title={<>Scored against <em>your</em> requirements.</>}
        visual={<div className="l-ui"><FitCard fit={acme.fit!} /></div>}
      >
        <p>Company size and location are checked exactly; everything else by Jev. A near miss counts half, and an unsure answer says so. The number always adds up.</p>
        <ul className="l-points"><li>75% your requirements, 25% overall judgment</li><li>Every check shown, never hidden in the score</li></ul>
      </Answer>

      <Answer
        score="74" eyebrow="Why now?" tint="sand" flip
        title={<>Reasons to reach out <em>this week.</em></>}
        visual={
          <div className="l-ui-stack">
            <div className="l-ui"><WhyNowCard whyNow={acme.whyNow!} /></div>
            <div className="l-float quote">
              <span className="l-mono">acme.example/pricing</span>
              "SSO, SCIM and audit logs on the new Enterprise plan"
            </div>
          </div>
        }
      >
        <p>Hiring for the roles your product serves, headcount growth, fresh funding, and what their own site says. Every signal links to where it came from.</p>
        <ul className="l-points"><li>Labels written by Sift, quotes taken word for word</li><li>Relevance judged against what you sell</li></ul>
      </Answer>

      <Answer
        score="92" eyebrow="Who to email?" tint="peach"
        title={<>The person who <em>owns the problem.</em></>}
        visual={<div className="l-ui contacts"><ContactPicker contacts={acmeRevealed.contacts!} reveal={noop} /></div>}
      >
        <p>Senior people first, then the leads who actually run the team at smaller companies, ranked by how likely they own what you solve. When two are equally good, you see both.</p>
        <ul className="l-points"><li>Reveal one email, or all of them, with the cost shown first</li><li>Finding people is free</li></ul>
      </Answer>

      <Answer
        score="88" eyebrow="On LinkedIn too" tint="fog" flip
        title={<>From a profile to <em>a verdict.</em></>}
        visual={
          <div className="l-li">
            <div className="l-li-card">
              <span className="l-mono">linkedin.com/in/jonas-berg</span>
              <strong>Jonas Berg</strong>
              <span>Head of Support at Acme</span>
            </div>
            <svg className="l-li-arrow" viewBox="0 0 60 20" aria-hidden><path d="M2 10 H52 M44 3 L54 10 L44 17" /></svg>
            <div className="l-ui"><ProfileCard result={fromProfile} /></div>
          </div>
        }
      >
        <p>Click Sift on someone's profile. It works out who they are from the address alone, then shows their company's fit and where they rank among the people there.</p>
        <ul className="l-points"><li>1 credit, their email included</li><li>Never reads LinkedIn's pages</li></ul>
      </Answer>
    </section>
  );
}

// ---------- after the click: one dark card, one light ----------

function After() {
  return (
    <section className="l-after l-wrap" data-reveal>
      <div className="l-tile dark">
        <Eyebrow label="My Accounts" dark />
        <h3>Every company you save, ranked.</h3>
        <p>By fit and timing, with a status, a note and CSV export. Refresh any account for 2 credits.</p>
        <div className="l-mini-rows" aria-hidden>
          {[['Acme', 90, 74], ['Northwind', 81, 52], ['Harbor', 64, 70]].map(([n, f, t]) => (
            <div key={n as string}><span>{n}</span><span className="l-bar"><i style={{ width: `${f}%` }} /></span><b>{Math.round(0.6 * (f as number) + 0.4 * (t as number))}</b></div>
          ))}
        </div>
      </div>
      <div className="l-tile light">
        <Eyebrow label="Discover" />
        <h3>Fifty more like your best accounts.</h3>
        <p>Apollo's lookalike search, filtered by your ideal customer, for one credit. Look up the ones you like.</p>
        <div className="l-mini-chips" aria-hidden>
          {['lumen.example', 'kettle.example', 'fjordly.example', 'northwind.example', 'harbor.example'].map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>
    </section>
  );
}

// ---------- costs ----------

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      if (reduced || to === 0) return setN(to);
      const start = performance.now();
      const tick = (t: number) => {
        const k = Math.min((t - start) / 800, 1);
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(node);
    return () => io.disconnect();
  }, [to]);
  return <span ref={el}>{n}</span>;
}

function Costs() {
  const lines = [
    { n: 2, what: 'Look up a new company', note: '1 for the company, 1 for its job postings. Free again for 7 days.' },
    { n: 0, what: 'Find the people', note: "Apollo's people search costs nothing." },
    { n: 1, what: 'Reveal an email', note: 'Only charged when Apollo finds the person.' },
    { n: 1, what: 'Look up a LinkedIn profile', note: 'Email included. Free again for 30 days.' },
  ];
  return (
    <section id="costs" className="l-costs l-wrap">
      <div className="l-costs-head" data-reveal>
        <Eyebrow label="Costs" />
        <h2>It costs <em>what it says.</em></h2>
        <p>Sift spends your Apollo credits (or treg or Monid dollars, at $0.026 a credit) and puts the price on every button. Set a monthly budget and it asks before going over.</p>
      </div>
      <div className="l-receipt" data-reveal>
        <div className="l-receipt-top"><span>Apollo credits</span><span>per action</span></div>
        {lines.map((l) => (
          <div key={l.what} className="l-receipt-line" style={{ '--i': lines.indexOf(l) } as React.CSSProperties}>
            <div>
              <div className="l-receipt-what">{l.what}<i aria-hidden /></div>
              <p>{l.note}</p>
            </div>
            <div className="l-receipt-n"><CountUp to={l.n} /></div>
          </div>
        ))}
        <div className="l-receipt-foot"><span>Sift's own fee</span><b>0</b></div>
      </div>
    </section>
  );
}

// ---------- privacy: a dark band ----------

function Privacy() {
  return (
    <section id="privacy" className="l-privacy">
      <Suspense fallback={null}><LazyBlinds /></Suspense>
      <div className="l-wrap l-privacy-in" data-reveal>
        <div>
          <Eyebrow label="Privacy" dark />
          <h2>Your keys. Your browser. <em>Nothing in between.</em></h2>
          <ul>
            <li>No Sift server, no account, no analytics in the extension.</li>
            <li>Lookups go straight to Apollo, or through treg or Monid if you choose one, and to TypeSafe.</li>
            <li>Keys, profile and saved accounts stay in Chrome's local storage.</li>
            <li>Sift reads a site only when you click its icon there, or press Sift this page. On LinkedIn, only the address.</li>
          </ul>
          <a className="l-btn glass" href={PRIVACY}>Read the privacy policy</a>
        </div>
        <svg className="l-diagram" viewBox="0 0 440 300" role="img" aria-label="Your browser talks directly to Apollo and TypeSafe; there is no Sift server in between">
          <path className="flow" d="M150 150 C 230 150, 250 70, 330 70" />
          <path className="flow" d="M150 150 C 230 150, 250 230, 330 230" />
          <g className="node you"><circle cx="110" cy="150" r="42" /><text x="110" y="146">Your</text><text x="110" y="162">browser</text></g>
          <g className="node"><circle cx="366" cy="70" r="36" /><text x="366" y="75">Apollo</text></g>
          <g className="node"><circle cx="366" cy="230" r="36" /><text x="366" y="235">TypeSafe</text></g>
          <g className="gone"><circle cx="280" cy="150" r="22" /><text x="280" y="154">Sift</text><text x="280" y="190" className="gone-label">no server</text></g>
        </svg>
      </div>
    </section>
  );
}

// ---------- questions ----------

function Faq() {
  const qs: [string, string][] = [
    ['What do I need?', 'Chrome, a TypeSafe API key for Jev, and an Apollo API key, or a treg or Monid key. treg and Monid give you the same Apollo data without an Apollo plan, at $0.026 per paid action.'],
    ['What is treg?', 'A pay-per-call gateway to data APIs. Choose it in Settings instead of an Apollo key: Sift sends the same requests to Apollo through treg and gets the same answers, billed from your treg balance. treg then sees your lookups, the way Apollo does.'],
    ['What is Monid?', 'Another pay-per-call gateway, with one wallet for many APIs. It works like treg: Sift sends the same Apollo requests through Monid, billed from your Monid wallet, and Monid sees your lookups. One difference: finding similar companies (Discover) isn’t available through Monid yet.'],
    ['What is Jev?', "TypeSafe's decision model. It answers typed questions (yes or no, pick one, a score) with probabilities instead of writing text. That is why Sift's reasons are checks and quotes, never made-up prose."],
    ['How is the fit score worked out?', "75% your requirements, each one counted (a near miss counts half), and 25% Jev's overall judgment of the company."],
    ['Does it work on LinkedIn?', "Yes, on people's profiles. Sift sends only the profile's address to Apollo to find out who they are. It never reads LinkedIn's pages."],
    ['Can it find phone numbers?', 'Not yet. Apollo delivers phone numbers to a server, and Sift deliberately has none.'],
  ];
  return (
    <section className="l-faq l-wrap" data-reveal>
      <div>
        <Eyebrow label="Questions" />
        <h2>Good <em>questions.</em></h2>
      </div>
      <div>
        {qs.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------- the end: one night block, closing line on top, footer over a sea of slats ----------

// ---------- contact: three small cards, each showing where it goes ----------

const ICONS: Record<'web' | 'mail' | 'github', ReactNode> = {
  web: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9m0-18c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9M3.5 9h17M3.5 15h17" />,
  mail: <path d="M3.5 6.5h17v11h-17zM3.8 6.8 12 13l8.2-6.2" />,
  github: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
};

/** "Copy" slides up and out as "Copied ✓" slides in; both share one cell, so the button never changes size. */
export function CopyLabel({ done, label = 'Copy' }: { done: boolean; label?: string }) {
  return (
    <>
      <span aria-hidden={done}>{label}</span>
      <span aria-hidden={!done}>Copied ✓</span>
    </>
  );
}

function ContactLinks() {
  const [copied, setCopied] = useState(false);
  const cards: { icon: keyof typeof ICONS; label: string; detail: string; href: string; primary?: boolean }[] = [
    { icon: 'web', label: 'Portfolio', detail: PORTFOLIO.replace(/^https:\/\/|\/$/g, ''), href: PORTFOLIO, primary: true },
    { icon: 'mail', label: 'Email', detail: EMAIL, href: `mailto:${EMAIL}?subject=${encodeURIComponent('Sift')}` },
    { icon: 'github', label: 'GitHub', detail: '@' + MAKER.split('/').pop(), href: MAKER },
  ];
  return (
    <div className="l-contact">
      {cards.map((c) => (
        <div key={c.label} className={`l-contact-card ${c.primary ? 'primary' : ''}`}>
          <a className="l-contact-link" href={c.href} title={c.icon === 'mail' ? 'Opens your email app' : undefined} {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
            <svg className="l-contact-icon" viewBox="0 0 24 24" aria-hidden>{ICONS[c.icon]}</svg>
            <span className="l-contact-text">
              <span className="l-contact-label">{c.label}</span>
              <span className="l-contact-detail">{c.detail}</span>
            </span>
            <span className="l-contact-arrow" aria-hidden>{c.href.startsWith('mailto') ? '→' : '↗'}</span>
          </a>
          {c.icon === 'mail' && (
            <button
              className={`l-contact-copy cp ${copied ? 'done' : ''}`}
              aria-label={copied ? 'Copied' : 'Copy email address'}
              onClick={() => navigator.clipboard?.writeText(EMAIL).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1400)))}
            >
              <CopyLabel done={copied} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function End() {
  return (
    <footer className="l-end">
      <div className="l-end-copy l-wrap" data-reveal>
        <h2>Sift the next company <em>you visit.</em></h2>
        <div className="l-ctas">
          <a className="l-btn cream" href={INSTALL}>Install Sift <Arrow /></a>
          <a className="l-btn glass" href={REPO}>Read the source</a>
        </div>
      </div>
      <div className="l-wrap l-maker" data-reveal>
        <img src={`${MAKER}.png?size=112`} alt="" width="56" height="56" loading="lazy" />
        <div className="l-maker-who">
          <span className="l-mono">Made by</span>
          <strong>Aditya Venkatesan</strong>
          <p>A GTM engineer building Sift in the open. Ideas, bugs, or just want to say hi? I read everything.</p>
        </div>
        <ContactLinks />
      </div>
      <div className="l-wrap l-footer-top">
        <div className="l-footer-brand">
          <a className="l-brand" href="/#top"><img src={icon48} alt="" width="26" height="26" /> Sift</a>
          <p>Know who's worth talking to. Open source, on your own keys.</p>
        </div>
        <div className="l-footer-cols">
          <div>
            <h4>Product</h4>
            <a href="/#answers">How it works</a>
            <a href="/#costs">Costs</a>
            <a href="/agents">For agents (MCP)</a>
            <a href={INSTALL}>Install</a>
          </div>
          <div>
            <h4>Project</h4>
            <a href={REPO}>GitHub</a>
            <a href={LOG}>Changelog</a>
            <a href={ISSUES}>Report an issue</a>
            <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>
          </div>
          <div>
            <h4>Trust</h4>
            <a href={PRIVACY}>Privacy policy</a>
            <a href="/#privacy">No server</a>
          </div>
        </div>
      </div>
      <div className="l-sea">
        <Suspense fallback={null}><LazySlats /></Suspense>
      </div>
      <div className="l-wrap l-footer-base">
        <span>Built on Apollo, treg, Monid and TypeSafe Jev. Not affiliated with any of them.</span>
        <span>2026</span>
      </div>
    </footer>
  );
}
