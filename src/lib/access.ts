import type { Keys } from './types';

/** How Sift reaches Apollo: directly with the user's Apollo key, or through treg.to with their treg key. */
export type Access = { via: 'apollo' | 'treg'; key: string };

/** Which way to reach Apollo, from the saved keys. */
export function accessFor(keys: Keys): Access {
  return keys.provider === 'treg' ? { via: 'treg', key: keys.treg ?? '' } : { via: 'apollo', key: keys.apollo };
}

/** True when the key for the chosen data source is filled in. */
export const hasDataKey = (keys: Keys | undefined): keys is Keys => !!keys && !!accessFor(keys).key;

