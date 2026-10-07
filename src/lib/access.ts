import type { Keys } from './types';

/** Where Sift gets Apollo's data: the user's own Apollo key, or a pay-per-call gateway with its key. */
export type Source = 'apollo' | 'treg' | 'monid';
/** The pay-per-call gateways: prices in dollars, a prepaid balance, the exact charge reported per call. */
export type Gateway = Exclude<Source, 'apollo'>;

/** How Sift reaches Apollo: directly, or through a gateway. */
export type Access = { via: Source; key: string };

export const GATEWAYS: Record<Gateway, { name: string; site: string; url: string }> = {
  treg: { name: 'treg', site: 'treg.to', url: 'https://treg.to' },
  monid: { name: 'Monid', site: 'monid.ai', url: 'https://monid.ai' },
};

export const isGateway = (s: Source | undefined): s is Gateway => s === 'treg' || s === 'monid';

/** The saved key for a source. */
export const sourceKey = (keys: Keys, src: Source): string => (src === 'apollo' ? keys.apollo : keys[src] ?? '');

/** Which way to reach Apollo, from the saved keys. */
export function accessFor(keys: Keys): Access {
  const via = keys.provider ?? 'apollo';
  return { via, key: sourceKey(keys, via) };
}

/** True when the key for the chosen data source is filled in. */
export const hasDataKey = (keys: Keys | undefined): keys is Keys => !!keys && !!accessFor(keys).key;
