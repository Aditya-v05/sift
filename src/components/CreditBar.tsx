import { balanceIsFor, budgetLabel, isTregBalance, totalSpent } from '@/lib/credits';
import { GATEWAYS } from '@/lib/access';
import type { CreditState } from './useCredits';

const fmt = (n: number) => n.toLocaleString('en-US');
const usd = (n: number) => `$${n.toFixed(2)}`;

function Bar({ used, of }: { used: number; of: number }) {
  const ratio = of > 0 ? Math.min(used / of, 1) : 1;
  const tone = ratio >= 0.9 ? 'bad' : ratio >= 0.7 ? 'warn' : 'ok';
  return (
    <div className={`credit-bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={of} aria-valuenow={used}>
      <div style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

/**
 * Apollo's real balance when the key can read it (master keys); otherwise what Sift
 * has spent this month, against the user's budget if they set one.
 */
export function CreditBar({ credits, onSettings }: { credits: CreditState; onSettings: () => void }) {
  const { settings, ledger, balance, viaGateway, gateway } = credits;
  const name = gateway ? GATEWAYS[gateway].name : '';
  const spent = totalSpent(ledger);
  const budget = settings.monthlyBudget;

  // Through a gateway (treg, Monid): the prepaid dollar balance, and what Sift spent this month in dollars and paid calls.
  if (viaGateway) {
    const spentUsd = (ledger.usdMicro ?? 0) / 1e6;
    return (
      <div className="credits">
        <div className="row spread small">
          {isTregBalance(balance) && balanceIsFor(balance, gateway) ? (
            <span><strong>{usd(balance.usd)}</strong> left on {name}</span>
          ) : (
            <span><strong>{usd(spentUsd)}</strong> spent through {name} this month</span>
          )}
          <button className="link small" onClick={onSettings}>{budget === null ? 'Set budget' : 'Budget'}</button>
        </div>
        {budget !== null && <Bar used={spent} of={budget} />}
        <div className="small muted">
          Sift spent {usd(spentUsd)} this month{budget !== null ? ` of your ${budgetLabel(settings, true)} budget` : `, ${fmt(spent)} paid call${spent === 1 ? '' : 's'}`}
        </div>
      </div>
    );
  }

  if (balance?.available && !isTregBalance(balance)) {
    const resets = balance.cycleEnd ? new Date(balance.cycleEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    return (
      <div className="credits">
        <div className="row spread small">
          <span><strong>{fmt(balance.leftOver)}</strong> Apollo credits left</span>
          <span className="muted">{resets ? `resets ${resets}` : `of ${fmt(balance.limit)}`}</span>
        </div>
        <Bar used={balance.consumed} of={balance.limit} />
        <div className="small muted">
          Sift used {fmt(spent)} this month{budget !== null && `, budget ${fmt(budget)}`}
        </div>
      </div>
    );
  }

  return (
    <div className="credits">
      <div className="row spread small">
        <span>
          <strong>{fmt(spent)}</strong>
          {budget !== null ? ` of ${fmt(budget)}` : ''} Apollo credits used this month
        </span>
        <button className="link small" onClick={onSettings}>{budget === null ? 'Set budget' : 'Budget'}</button>
      </div>
      {budget !== null && <Bar used={spent} of={budget} />}
    </div>
  );
}
