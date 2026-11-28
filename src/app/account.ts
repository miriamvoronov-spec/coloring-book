/**
 * Each account on a device gets its own library and settings, so two people
 * who sign in on the same tablet never see or overwrite each other's books.
 *
 * The library that was on the device before anyone signed in belongs to the
 * first account that signs in there. Every other account starts fresh: empty
 * library (with the demo book), default settings, no colouring. Signed out,
 * after the device library was claimed, a separate empty guest library opens.
 */
const MAP_KEY = 'mcb@accounts';
const AUTH_KEY = 'mcb.cloud.auth';

interface AccountMap { owner?: string; known: Record<string, string> }

function readMap(): AccountMap {
  try { const m = JSON.parse(localStorage.getItem(MAP_KEY) || 'null'); if (m && typeof m === 'object' && m.known) return m; } catch { /* fresh */ }
  return { known: {} };
}
function writeMap(m: AccountMap): void { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* storage blocked */ } }

/** The signed-in user's id, read straight from the saved session (no network). */
export function storedUserId(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    const id = raw?.user?.id ?? raw?.currentSession?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch { return null; }
}

/** Which storage space belongs to this user (null = nobody signed in). */
export function spaceFor(userId: string | null): string {
  const m = readMap();
  if (!userId) return m.owner ? 'guest' : 'default';
  if (m.known[userId]) return m.known[userId];
  if (!m.owner) { m.owner = userId; m.known[userId] = 'default'; }
  else m.known[userId] = 'u' + userId.replace(/[^a-z0-9]/gi, '').slice(0, 24);
  writeMap(m);
  return m.known[userId];
}

/** The space this page load uses. Fixed until the page reloads. */
export const SPACE = spaceFor(storedUserId());
export const dbName = (): string => SPACE === 'default' ? 'miriam-coloring-books' : `miriam-coloring-books@${SPACE}`;
export const prefPrefix = (): string => SPACE === 'default' ? 'mcb.' : `mcb@${SPACE}.`;

/** Someone signed in or out: if that means a different library, reopen the app in it. */
export function accountChanged(userId: string | null, then: 'friends' | 'home' = 'home'): void {
  if (spaceFor(userId) === SPACE) return;
  try { sessionStorage.setItem('mcb.afterSwitch', then); } catch { /* fine */ }
  location.reload();
}
export function takeAfterSwitch(): string | null {
  try { const v = sessionStorage.getItem('mcb.afterSwitch'); sessionStorage.removeItem('mcb.afterSwitch'); return v; } catch { return null; }
}
