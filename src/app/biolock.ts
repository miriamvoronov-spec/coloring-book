/**
 * Fingerprint (or face) unlock for her account on this device, with the
 * phone's or tablet's own screen lock (WebAuthn, platform authenticator).
 * Nothing leaves the device: it only proves the owner is holding it.
 */
import { prefs } from './store';

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let unlocked = false;

export async function bioAvailable(): Promise<boolean> {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
/** What this device calls its biometric lock, for the button text. */
export function bioName(): string {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID / Touch ID';
  if (/macintosh/i.test(ua)) return 'Touch ID';
  if (/windows/i.test(ua)) return 'Windows Hello';
  return 'טביעת אצבע';
}
export const bioOn = (): boolean => !!prefs.get<string>('bioCred', '');
export const bioUnlocked = (): boolean => unlocked || !bioOn();

export async function enableBio(name: string): Promise<void> {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rnd(32), rp: { name: "Miriam's Coloring Books" },
    user: { id: rnd(16), name: name || 'me', displayName: name || 'me' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error('בוטל');
  prefs.set('bioCred', b64(cred.rawId));
  unlocked = true;
}
export function disableBio(): void { prefs.del('bioCred'); }

export async function unlockBio(): Promise<boolean> {
  const id = prefs.get<string>('bioCred', '');
  if (!id) return true;
  try {
    const r = await navigator.credentials.get({ publicKey: {
      challenge: rnd(32), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000,
    } });
    unlocked = !!r;
  } catch { unlocked = false; }
  return unlocked;
}
