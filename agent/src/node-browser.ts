/*
 * Stands in for `wxt/browser` when Sift's engine (src/lib) runs in Node. The bundle aliases the import here
 * (see build.mjs), so the extension's code runs unchanged.
 *
 * storage.local persists to $SIFT_HOME/store.json (default ~/.sift): cache, reveals, saved accounts, the
 * spend ledger, the ICP. API keys are never written to disk: they come from the environment and live in
 * memory. storage.session is memory only.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
const listeners = new Set<Listener>();

/** Never persisted. */
const MEMORY_ONLY = new Set(['keys']);

export const siftHome = () => process.env.SIFT_HOME || join(homedir(), '.sift');
const file = () => join(siftHome(), 'store.json');

let disk: Record<string, unknown> | null = null;
function load(): Record<string, unknown> {
  if (disk) return disk;
  try {
    disk = JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>;
  } catch {
    disk = {};
  }
  return disk;
}

function save() {
  const out = Object.fromEntries(Object.entries(load()).filter(([k]) => !MEMORY_ONLY.has(k)));
  mkdirSync(siftHome(), { recursive: true, mode: 0o700 });
  const tmp = `${file()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
  renameSync(tmp, file()); // atomic: a crash never leaves a half-written store
}

function area(name: 'local' | 'session') {
  const memory: Record<string, unknown> = {};
  const data = () => (name === 'local' ? load() : memory);
  return {
    async get(keys?: string | string[]) {
      const d = data();
      if (keys === undefined) return structuredClone(d);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in d).map((k) => [k, structuredClone(d[k])]));
    },
    async set(items: Record<string, unknown>) {
      const d = data();
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        d[k] = structuredClone(v);
        changes[k] = { newValue: v };
      }
      if (name === 'local' && Object.keys(items).some((k) => !MEMORY_ONLY.has(k))) save();
      listeners.forEach((l) => l(changes, name));
    },
  };
}

/** For tests: forget what was loaded, so a new SIFT_HOME is read fresh. */
export function resetNodeBrowser() {
  disk = null;
}

export const browser = {
  storage: {
    local: area('local'),
    session: area('session'),
    onChanged: {
      addListener: (l: Listener) => void listeners.add(l),
      removeListener: (l: Listener) => void listeners.delete(l),
    },
  },
  runtime: { sendMessage: async () => undefined, getURL: (p: string) => p },
} as any;

export type Browser = typeof browser;
