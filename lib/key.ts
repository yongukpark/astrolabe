// The user's own Jev keys. Live only in this browser; the active one is sent per request to /api/judge, never stored server-side.
export type Provider = 'typesafe' | 'openrouter';
export type Key = { name: string; provider: Provider; apiKey: string };
type Store = { keys: Key[]; active: number };

const STORAGE = 'find-papers-keys';
let mem: Store = { keys: [], active: -1 }; // fallback when localStorage is blocked (private mode etc.)

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? 'null') ?? mem;
  } catch {
    return mem;
  }
}

function write(s: Store) {
  mem = s;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(s));
  } catch {}
}

export const loadKeys = () => read().keys;
export const loadKey = (): Key | null => read().keys[read().active] ?? null;
export const selectKey = (i: number) => write({ ...read(), active: i });

export function addKey(k: Key) {
  const keys = [...read().keys, k];
  write({ keys, active: keys.length - 1 });
}

export function removeKey(i: number) {
  const { keys, active } = read();
  write({ keys: keys.filter((_, j) => j !== i), active: i === active ? -1 : active > i ? active - 1 : active });
}

export const PROVIDER_NAME: Record<Provider, string> = { typesafe: 'TypeSafe', openrouter: 'OpenRouter' };
