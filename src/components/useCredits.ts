import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, emptyLedger, type Balance, type Ledger, type Settings } from '@/lib/credits';
import * as store from '@/lib/storage';
import { isGateway, type Gateway } from '@/lib/access';

export interface CreditState {
  settings: Settings;
  ledger: Ledger;
  balance: Balance | undefined;
  /** Apollo data comes through a gateway (treg, Monid): prices read in dollars, the balance is the gateway's. */
  viaGateway: boolean;
  /** Which gateway, or null for the user's own Apollo key. */
  gateway: Gateway | null;
}

/** Live view of credit settings, this month's spend, the balance, and which data source is in use. */
export function useCredits(): CreditState {
  const [state, setState] = useState<CreditState>({ settings: DEFAULT_SETTINGS, ledger: emptyLedger(), balance: undefined, viaGateway: false, gateway: null });
  useEffect(() => {
    const load = async () => {
      const [settings, ledger, balance, keys] = await Promise.all([store.getSettings(), store.getLedger(), store.getBalance(), store.getKeys()]);
      const gateway = isGateway(keys?.provider) ? keys!.provider as Gateway : null;
      setState({ settings, ledger, balance, viaGateway: gateway !== null, gateway });
    };
    load();
    return store.onLocalChange(['settings', 'credits', 'balance', 'keys'], load);
  }, []);
  return state;
}
