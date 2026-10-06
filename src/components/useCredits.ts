import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, emptyLedger, type Balance, type Ledger, type Settings } from '@/lib/credits';
import * as store from '@/lib/storage';

export interface CreditState {
  settings: Settings;
  ledger: Ledger;
  balance: Balance | undefined;
  /** Apollo data comes through treg: prices read in dollars, the balance is treg's. */
  viaTreg: boolean;
}

/** Live view of credit settings, this month's spend, the balance, and which data source is in use. */
export function useCredits(): CreditState {
  const [state, setState] = useState<CreditState>({ settings: DEFAULT_SETTINGS, ledger: emptyLedger(), balance: undefined, viaTreg: false });
  useEffect(() => {
    const load = async () => {
      const [settings, ledger, balance, keys] = await Promise.all([store.getSettings(), store.getLedger(), store.getBalance(), store.getKeys()]);
      setState({ settings, ledger, balance, viaTreg: keys?.provider === 'treg' });
    };
    load();
    return store.onLocalChange(['settings', 'credits', 'balance', 'keys'], load);
  }, []);
  return state;
}
