import { useEffect, useState } from 'react';
import { StateIcon } from '@/components/Icon';
import { useCredits } from '@/components/useCredits';
import { isTregBalance, lookupCost, priceLabel, totalSpent, usdFor } from '@/lib/credits';
import { openAccounts, send, type KeyTest, type SourceSwitch } from '@/lib/messages';
import { SENIORITY_OPTIONS, peopleFilters } from '@/lib/people';
import { generateRules } from '@/lib/rules';
import * as store from '@/lib/storage';
import type { Keys, ProfileAnswers, Rules } from '@/lib/types';
import './options.css';

export default function Options() {
  return (
    <main className="options stack">
      <header>
        <h1>Sift</h1>
        <p className="muted">
          Everything stays in this browser. Your keys are sent only to Apollo (or treg, if you choose it) and TypeSafe. There's no Sift server and no tracking.
        </p>
      </header>
      <KeysSection />
      <ProfileSection />
      <CreditsSection />
      <AccountsSection />
    </main>
  );
}

// ---------- keys ----------

type Source = 'apollo' | 'treg';
type FieldStatus = { state: 'checking' } | KeyTest;

/** The data sources, in the order the dropdown lists them. Add new ones here. */
const SOURCES: { id: Source; label: string }[] = [
  { id: 'apollo', label: 'Apollo, with your API key' },
  { id: 'treg', label: 'treg, pay per call (no Apollo plan needed)' },
];
const sourceName = (s: Source) => (s === 'treg' ? 'treg' : 'your Apollo key');

/** Asked from elsewhere on the page (the costs section) to show a source whose key still has to be added. */
const PICK_EVENT = 'sift:pick-source';

/**
 * Switch the data source. With a saved key that still connects it switches at once (the background checks
 * and saves); otherwise it says why. Shared by the dropdown and the link in the costs section.
 */
function switchSource(src: Source): Promise<SourceSwitch> {
  return send({ type: 'useSource', provider: src });
}

/**
 * Keys save themselves: a key is tested a moment after you paste or type it, and kept once it connects.
 * Picking a data source switches at once when its key is already saved; otherwise its key field opens and
 * Sift switches as soon as that key connects. No Save button.
 */
function KeysSection() {
  const [saved, setSaved] = useState<Keys>({ apollo: '', typesafe: '', provider: 'apollo', treg: '' });
  const [draft, setDraft] = useState<Keys>(saved);
  const [status, setStatus] = useState<{ data?: FieldStatus; jev?: FieldStatus }>({});
  const [ready, setReady] = useState(false);
  const source: Source = draft.provider ?? 'apollo';
  const using: Source = saved.provider ?? 'apollo';
  const dataKey = (k: Keys, src: Source) => (src === 'treg' ? k.treg ?? '' : k.apollo);

  useEffect(() => {
    const load = (first: boolean) =>
      store.getKeys().then((k) => {
        const full: Keys = { apollo: '', typesafe: '', provider: 'apollo', treg: '', ...k };
        setSaved(full);
        // A switch made elsewhere (the costs section) moves the dropdown too; typed keys are kept.
        setDraft((d) => (first ? full : { ...d, provider: full.provider }));
        setReady(true);
      });
    load(true);
    const off = store.onLocalChange(['keys'], () => load(false));
    const onPick = (e: Event) => {
      setDraft((d) => ({ ...d, provider: (e as CustomEvent<Source>).detail }));
      document.getElementById('keys')?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener(PICK_EVENT, onPick);
    return () => {
      off();
      window.removeEventListener(PICK_EVENT, onPick);
    };
  }, []);

  // Test whatever changed, a moment after the last keystroke, and keep what connects.
  useEffect(() => {
    if (!ready) return;
    const src = draft.provider ?? 'apollo';
    const dataChanged = dataKey(draft, src).trim() && (dataKey(draft, src).trim() !== dataKey(saved, src) || src !== using);
    const jevChanged = draft.typesafe.trim() && draft.typesafe.trim() !== saved.typesafe;
    if (!dataChanged && !jevChanged) return;
    const t = setTimeout(async () => {
      const candidate: Keys = {
        apollo: draft.apollo.trim(), typesafe: (jevChanged ? draft.typesafe : saved.typesafe).trim(), provider: src, treg: (draft.treg ?? '').trim(),
      };
      setStatus((st) => ({ data: dataChanged ? { state: 'checking' } : st.data, jev: jevChanged ? { state: 'checking' } : st.jev }));
      const res = await send({ type: 'testKeys', keys: candidate });
      const next: Keys = { ...saved };
      if (dataChanged && res.apollo.ok) {
        next.provider = src;
        if (src === 'treg') next.treg = candidate.treg;
        else next.apollo = candidate.apollo;
      }
      if (jevChanged && res.typesafe.ok) next.typesafe = candidate.typesafe;
      setStatus((st) => ({ data: dataChanged ? res.apollo : st.data, jev: jevChanged ? res.typesafe : st.jev }));
      if (JSON.stringify(next) !== JSON.stringify(saved)) {
        await store.setKeys(next);
        setSaved(next);
        await send({ type: 'refreshBalance' });
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, ready]);

  const [switching, setSwitching] = useState(false);
  const pick = async (src: Source) => {
    setStatus((st) => ({ ...st, data: undefined }));
    if (src === using) return setDraft({ ...draft, provider: src });
    setSwitching(true);
    const res = await switchSource(src);
    setSwitching(false);
    // Switched: the storage listener moves everything over. Otherwise show that source's key field.
    if (!res.ok) {
      setDraft({ ...draft, provider: src });
      if (res.reason === 'failed') setStatus((st) => ({ ...st, data: { ok: false, message: res.message } }));
    }
  };

  const pending = source !== using;
  return (
    <section className="card stack" id="keys">
      <h2>API keys</h2>
      <div>
        <label htmlFor="source">Company and people data</label>
        <select id="source" className="source" value={source} disabled={switching} onChange={(e) => pick(e.target.value as Source)}>
          {SOURCES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className={`small hint ${pending ? 'state-unsure' : 'muted'}`}>
          {switching
            ? 'Switching…'
            : pending
              ? `Paste your ${source === 'treg' ? 'treg' : 'Apollo'} key below. Sift switches as soon as it connects.`
              : `Sift is using ${sourceName(using)}.`}
        </div>
      </div>
      {source === 'treg' ? (
        <KeyField
          label="treg API key"
          hint={<>From <a href="https://treg.to" target="_blank" rel="noreferrer">treg.to</a>. Sift uses Apollo's data through treg: finding people is free, every other call costs $0.026 from your treg balance.</>}
          value={draft.treg ?? ''}
          onChange={(treg) => setDraft({ ...draft, treg })}
          status={status.data}
        />
      ) : (
        <KeyField
          label="Apollo API key"
          hint={<>In Apollo: Settings, Integrations, API. It needs access to people search and enrichment.</>}
          value={draft.apollo}
          onChange={(apollo) => setDraft({ ...draft, apollo })}
          status={status.data}
        />
      )}
      <KeyField
        label="TypeSafe API key (Jev)"
        hint={<>From <a href="https://typesafe.ai" target="_blank" rel="noreferrer">typesafe.ai</a>. Jev makes the fit and ranking judgments.</>}
        value={draft.typesafe}
        onChange={(typesafe) => setDraft({ ...draft, typesafe })}
        status={status.jev}
      />
      <p className="small muted" style={{ margin: 0 }}>Keys are checked and saved as you paste them.</p>
    </section>
  );
}

function KeyField(props: { label: string; hint: React.ReactNode; value: string; onChange: (v: string) => void; status?: FieldStatus }) {
  const [shown, setShown] = useState(false);
  const st = props.status;
  return (
    <div>
      <label>{props.label}</label>
      <div className="row">
        <input type={shown ? 'text' : 'password'} value={props.value} onChange={(e) => props.onChange(e.target.value)} autoComplete="off" spellCheck={false} />
        <button className="ghost" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
      </div>
      <div className="small muted hint">{props.hint}</div>
      {st && ('state' in st ? (
        <div className="small muted row">Checking…</div>
      ) : (
        <div className={`small row ${st.ok ? 'ok' : 'err'}`}>
          <StateIcon state={st.ok ? 'met' : 'not_met'} /> {st.ok ? 'Connected and saved' : st.message}
        </div>
      ))}
    </div>
  );
}

// ---------- profile ----------

const EMPTY_ANSWERS: ProfileAnswers = { sells: '', icp: '', buyers: '' };

function ProfileSection() {
  const [answers, setAnswers] = useState<ProfileAnswers>(EMPTY_ANSWERS);
  const [rules, setRules] = useState<Rules | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    store.getProfile().then((p) => {
      if (!p) return;
      setAnswers(p.answers);
      setRules(p.rules);
    });
  }, []);

  const complete = answers.sells.trim() && answers.icp.trim() && answers.buyers.trim();

  const save = async () => {
    if (!rules) return;
    await store.setProfile({ answers, rules, updatedAt: Date.now() });
    await store.clearCache(); // cached results were judged against the old profile
    setStatus('Saved. New lookups use this profile.');
  };

  return (
    <section className="card stack">
      <h2>What you sell</h2>
      <Field
        label="What do you sell?"
        placeholder="AI support QA software for SaaS companies."
        value={answers.sells}
        onChange={(sells) => setAnswers({ ...answers, sells })}
      />
      <Field
        label="Describe your ideal customer"
        placeholder="Series A–C SaaS companies, 50–500 employees, in North America, with large customer support teams."
        value={answers.icp}
        onChange={(icp) => setAnswers({ ...answers, icp })}
      />
      <Field
        label="Who normally buys?"
        placeholder="VP Customer Experience, Head of Support, COO"
        value={answers.buyers}
        onChange={(buyers) => setAnswers({ ...answers, buyers })}
        rows={2}
      />
      <div>
        <button disabled={!complete} onClick={() => { setRules(generateRules(answers)); setStatus(null); }}>
          {rules ? 'Regenerate rules from answers' : 'Generate rules'}
        </button>
      </div>

      {rules && (
        <>
          <RulesEditor rules={rules} onChange={setRules} />
          <div className="row">
            <button className="primary" disabled={!complete || !rules.personas.length} onClick={save}>Save profile</button>
            {status && <span className="small ok">{status}</span>}
          </div>
        </>
      )}
    </section>
  );
}

function Field(props: { label: string; placeholder: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label>{props.label}</label>
      <textarea rows={props.rows ?? 3} placeholder={props.placeholder} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function RulesEditor({ rules, onChange }: { rules: Rules; onChange: (r: Rules) => void }) {
  const hc = rules.headcount ?? { min: null, max: null };
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));
  const setHc = (patch: Partial<typeof hc>) => {
    const next = { ...hc, ...patch };
    onChange({ ...rules, headcount: next.min === null && next.max === null ? null : next });
  };

  return (
    <div className="rules stack">
      <p className="small muted">
        Check these rules and edit them. Headcount and country are checked exactly. Each company check is a yes/no question for Jev.
      </p>
      <div>
        <label>Company size (employees)</label>
        <div className="row">
          <input type="number" min={0} placeholder="Min" value={hc.min ?? ''} onChange={(e) => setHc({ min: num(e.target.value) })} />
          <span className="muted">to</span>
          <input type="number" min={0} placeholder="Max" value={hc.max ?? ''} onChange={(e) => setHc({ max: num(e.target.value) })} />
        </div>
      </div>
      <div>
        <label>Countries</label>
        <CommaInput
          value={rules.countries}
          placeholder="Any country (e.g. United States, Canada)"
          onChange={(countries) => onChange({ ...rules, countries })}
        />
      </div>
      <ListEditor
        label="Company checks"
        hint="e.g. “B2B SaaS”, “Has a large customer support team”"
        items={rules.checks}
        onChange={(checks) => onChange({ ...rules, checks })}
      />
      <PeopleEditor rules={rules} onChange={onChange} />
    </div>
  );
}

/** "Who to look for": the few Apollo people filters its API actually honours, plus our own exclusion. */
function PeopleEditor({ rules, onChange }: { rules: Rules; onChange: (r: Rules) => void }) {
  const f = peopleFilters(rules);
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...f.seniorities, value] : f.seniorities.filter((s) => s !== value);
    // Keep Apollo's order, most senior first.
    onChange({ ...rules, seniorities: SENIORITY_OPTIONS.map(([v]) => v).filter((v) => next.includes(v)) });
  };
  return (
    <div className="people-editor stack">
      <h3>Who to look for</h3>
      <p className="small muted">
        Sift searches Apollo three ways and ranks everyone it finds: your titles at the seniorities below, then people at those
        seniorities whose title mentions a keyword, then your titles at any level. People search costs no credits.
      </p>
      <ListEditor
        label="Titles"
        hint="e.g. VP Customer Experience. Also used to pick the best persona."
        items={rules.personas}
        onChange={(personas) => onChange({ ...rules, personas })}
      />
      <div>
        <label>Seniority</label>
        <div className="row wrap seniorities">
          {SENIORITY_OPTIONS.map(([value, label]) => (
            <label key={value} className="row checkbox">
              <input type="checkbox" checked={f.seniorities.includes(value)} onChange={(e) => toggle(value, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        {!f.seniorities.length && <div className="small muted">None checked: any level.</div>}
      </div>
      <ListEditor
        label="Keywords"
        hint="One word each, e.g. operations. Finds titles you didn't list, like Head of Customer Operations."
        items={f.keywords}
        onChange={(keywords) => onChange({ ...rules, keywords })}
      />
      {f.keywords.length > 5 && <div className="small muted">Only the first 5 keywords are searched on each lookup.</div>}
      <ListEditor
        label="Leave out titles containing"
        hint="e.g. intern, associate"
        items={f.excludeTitles}
        onChange={(excludeTitles) => onChange({ ...rules, excludeTitles })}
      />
    </div>
  );
}

/** Keeps its own text so typing commas and spaces isn't eaten by re-parsing. */
function CommaInput({ value, placeholder, onChange }: { value: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join('|')]);
  return (
    <input
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
    />
  );
}

function ListEditor({ label, hint, items, onChange }: { label: string; hint: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div>
      <label>{label}</label>
      <ul className="list">
        {items.map((item, i) => (
          <li key={i} className="row">
            <input value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="ghost" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input placeholder={hint} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={!draft.trim()}>Add</button>
      </form>
    </div>
  );
}

// ---------- credits ----------

function CreditsSection() {
  const { settings, ledger, balance, viaTreg } = useCredits();
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<string | null>(null);

  // Switch right here when the other source's key is saved; otherwise open its key field above.
  const switchHere = async () => {
    const target: Source = viaTreg ? 'apollo' : 'treg';
    setSwitchMsg('Switching…');
    const res = await switchSource(target);
    if (res.ok) {
      setSwitchMsg(`Switched to ${sourceName(target)}.`);
      setTimeout(() => setSwitchMsg(null), 2500);
    } else if (res.reason === 'no_key') {
      setSwitchMsg(null);
      window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: target }));
    } else {
      setSwitchMsg(res.message);
    }
  };

  // The balance shown must match the source in use; fetch it when it doesn't (e.g. right after a switch).
  const balanceMatches = viaTreg === isTregBalance(balance);
  useEffect(() => {
    if (balanceMatches) return;
    setChecking(true);
    send({ type: 'refreshBalance' }).finally(() => setChecking(false));
  }, [balanceMatches]);
  const shownBudget = settings.monthlyBudget === null
    ? ''
    : viaTreg ? String(+(settings.budgetUsd ?? usdFor(settings.monthlyBudget)).toFixed(2)) : String(settings.monthlyBudget);
  const budgetValue = budgetText ?? shownBudget;

  // The budget saves itself a moment after you stop typing. Through treg it's typed in dollars.
  useEffect(() => {
    if (budgetText === null) return;
    const t = setTimeout(async () => {
      const raw = budgetText.trim() === '' ? null : Number(budgetText);
      const valid = raw === null || (Number.isFinite(raw) && raw >= 0);
      if (!valid) return;
      const next = raw === null
        ? { ...settings, monthlyBudget: null, budgetUsd: null }
        : viaTreg
          ? { ...settings, monthlyBudget: Math.floor(raw / 0.026), budgetUsd: raw }
          : { ...settings, monthlyBudget: Math.round(raw), budgetUsd: null };
      await store.setSettings(next);
      setBudgetText(null);
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 1500);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetText]);
  const check = async () => {
    setChecking(true);
    await send({ type: 'refreshBalance' });
    setChecking(false);
  };

  return (
    <section className="card stack">
      <h2>{viaTreg ? 'Costs (treg)' : 'Apollo credits'}</h2>
      <div className="small row">
        <span className="muted">Data comes from {viaTreg ? 'treg' : 'your Apollo key'}.</span>
        <button className="link small" disabled={switchMsg === 'Switching…'} onClick={switchHere}>
          Switch to {viaTreg ? 'your Apollo key' : 'treg'}
        </button>
        {switchMsg && <span className={switchMsg.startsWith('Switched') ? 'ok' : switchMsg === 'Switching…' ? 'muted' : 'err'}>{switchMsg}</span>}
      </div>
      {viaTreg ? (
        <p className="small muted" style={{ margin: 0 }}>
          Through treg, each paid Apollo call costs $0.026 from your treg balance. A new company lookup is {lookupCost(settings)} call
          {lookupCost(settings) === 1 ? '' : 's'} ({priceLabel(lookupCost(settings), true)}): the company{settings.fetchJobs ? ' and its job postings' : ''}.
          People search is free. Revealing an email is $0.026, charged only when Apollo finds the person. Repeat visits use the
          7-day cache and cost nothing.
        </p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          A new company lookup costs {lookupCost(settings)} Apollo credit{lookupCost(settings) === 1 ? '' : 's'}: 1 for the company
          {settings.fetchJobs ? ', 1 for job postings' : ''}. People search is free. Revealing an email costs 1. On a LinkedIn
          profile, identifying the person costs 1 (their email comes with it).
          Repeat visits use the 7-day cache and cost nothing.
        </p>
      )}

      <div>
        <label>Spent by Sift this month</label>
        <div>
          <strong>{totalSpent(ledger)}</strong>{viaTreg && <> paid calls, <strong>${((ledger.usdMicro ?? 0) / 1e6).toFixed(2)}</strong></>}
          <span className="muted small">
            {' '}({ledger.company} company lookups, {ledger.jobs} job-posting fetches, {ledger.reveal} email reveals
            {ledger.search ? `, ${ledger.search} Discover searches` : ''})
          </span>
        </div>
      </div>

      <div>
        <label>{viaTreg ? 'treg balance' : 'Apollo balance'}</label>
        {viaTreg ? (
          isTregBalance(balance) ? (
            <div><strong>${balance.usd.toFixed(2)}</strong> left on treg <span className="muted small">(top up at treg.to)</span></div>
          ) : (
            <div className="small muted">{checking ? 'Checking balance…' : 'The balance shows here once your treg key connects.'}</div>
          )
        ) : balance?.available && !isTregBalance(balance) ? (
          <div>
            <strong>{balance.leftOver.toLocaleString('en-US')}</strong> of {balance.limit.toLocaleString('en-US')} lead credits left
            {balance.cycleEnd && <span className="muted small">, resets {new Date(balance.cycleEnd).toLocaleDateString()}</span>}
          </div>
        ) : (
          <div className="small muted">
            Your Apollo team balance shows here if your key is a <strong>master API key</strong>. Other keys can't read it, so Sift counts its own spending instead.
          </div>
        )}
        <button className="ghost small" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check balance now'}</button>
      </div>

      <div>
        <label>Monthly budget for Sift</label>
        <div className="row">
          {viaTreg && <span>$</span>}
          <input
            type="number"
            min={0}
            step={viaTreg ? 0.5 : 10}
            placeholder="No limit"
            value={budgetValue}
            onChange={(e) => setBudgetText(e.target.value)}
            style={{ maxWidth: 140 }}
            aria-label={viaTreg ? 'Monthly budget in dollars' : 'Monthly budget in credits'}
          />
          <span className="small muted">
            {viaTreg ? 'a month' : 'credits a month'}. Leave empty for no limit. Past it, lookups ask first.
          </span>
          {budgetSaved && <span className="small ok">Saved</span>}
        </div>
      </div>

      <label className="row checkbox">
        <input
          type="checkbox"
          checked={settings.fetchJobs}
          onChange={(e) => store.setSettings({ ...settings, fetchJobs: e.target.checked })}
        />
        <span>Hiring signals: fetch job postings for "why now" (+{viaTreg ? "$0.026" : "1 credit"} per lookup)</span>
      </label>

      <label className="row checkbox">
        <input
          type="checkbox"
          checked={settings.scanSite}
          onChange={(e) => store.setSettings({ ...settings, scanSite: e.target.checked })}
        />
        <span>
          Website signals: read the pricing, blog, changelog and security pages of the site you're on (free; only when you
          click the icon; nothing leaves your browser except snippets sent to Jev)
        </span>
      </label>
    </section>
  );
}

// ---------- accounts ----------

function AccountsSection() {
  return (
    <section className="card stack">
      <h2>My Accounts</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Saved and recently viewed companies, ranked by fit and timing, with status, notes and CSV export.
      </p>
      <div>
        <button onClick={() => openAccounts()}>Open My Accounts</button>
      </div>
    </section>
  );
}
