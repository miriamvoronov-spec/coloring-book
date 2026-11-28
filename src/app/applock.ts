/**
 * The account's lock on this device: a pattern (like a phone), a PIN, or a
 * password, chosen by each person for herself. Fingerprint / Face ID can be
 * added on top. Only a salted hash is kept, in this account's own settings.
 */
import { prefs } from './store';

export type LockKind = 'none' | 'pattern' | 'pin' | 'password';
interface Saved { kind: LockKind; salt: string; hash: string }

const KEY = 'lockCode';
let open = false;

async function digest(salt: string, value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const lockKind = (): LockKind => prefs.get<Saved | null>(KEY, null)?.kind ?? 'none';
export const codeOpen = (): boolean => open || lockKind() === 'none';
export function markOpen(): void { open = true; }

export async function setLock(kind: LockKind, value = ''): Promise<void> {
  if (kind === 'none') { prefs.del(KEY); prefs.del('lockFails'); return; }
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  prefs.set(KEY, { kind, salt, hash: await digest(salt, value) } satisfies Saved);
  prefs.del('lockFails');
  open = true;
}

/** Seconds to wait before another try (after 5 wrong tries: 30s, then longer). */
export function waitSeconds(): number {
  const f = prefs.get<{ n: number; at: number }>('lockFails', { n: 0, at: 0 });
  if (f.n < 5) return 0;
  const wait = Math.min(600, 30 * 2 ** (f.n - 5)) * 1000;
  return Math.max(0, Math.ceil((f.at + wait - Date.now()) / 1000));
}

export async function tryCode(value: string): Promise<boolean> {
  const s = prefs.get<Saved | null>(KEY, null);
  if (!s) return true;
  if (waitSeconds() > 0) return false;
  const ok = (await digest(s.salt, value)) === s.hash;
  if (ok) { open = true; prefs.del('lockFails'); }
  else { const f = prefs.get<{ n: number; at: number }>('lockFails', { n: 0, at: 0 }); prefs.set('lockFails', { n: f.n + 1, at: Date.now() }); }
  return ok;
}
