/**
 * Accounts, friends, groups, chat and shared books, on the person's own free
 * Supabase project (see supabase/README.md). The two connection codes come
 * from the build (VITE_SUPABASE_URL / VITE_SUPABASE_KEY) or from the
 * "connect" form in the app, and are kept on this device.
 */
import type { SupabaseClient, Session, RealtimeChannel } from '@supabase/supabase-js';
import { prefs, store } from './store';
import type { BookMeta, Category, PageRec } from './types';

export interface Person { id: string; username: string; display_name: string }
export interface Friend extends Person { status: 'pending' | 'accepted'; incoming: boolean }
export interface Group { id: string; name: string; icon: string; owner: string }
export interface Message { id: number; group_id: string; sender: string; body: string; book_id: string | null; created_at: string }
export interface SharedBook { id: string; owner: string; title: string; cover_color: string; pages: number; parts: number; bytes: number; created_at: string }

const PART = 45 * 1024 * 1024; // the free plan takes files up to 50 MB

const env = import.meta.env as Record<string, string | undefined>;
/** Miriam's own Supabase project. The publishable key is public by design; access is guarded by the row rules in supabase/schema.sql. */
const DEFAULT_URL = 'https://yeapzbqwncxmpkucafli.supabase.co';
const DEFAULT_KEY = 'sb_publishable_BnGJ07fksSG7o8SKd0MJkQ_vobNNJya';
export function cloudConfig(): { url: string; key: string } | null {
  const url = prefs.get<string>('cloudUrl', '') || env.VITE_SUPABASE_URL || DEFAULT_URL;
  const key = prefs.get<string>('cloudKey', '') || env.VITE_SUPABASE_KEY || DEFAULT_KEY;
  return url && key ? { url, key } : null;
}
export function setCloudConfig(url: string, key: string): void {
  prefs.set('cloudUrl', url.trim().replace(/\/+$/, ''));
  prefs.set('cloudKey', key.trim());
  client = null;
}

let client: SupabaseClient | null = null;
export async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const cfg = cloudConfig();
  if (!cfg) throw new Error('עוד לא חיברנו את השרת');
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, storageKey: 'mcb.cloud.auth' } });
  return client;
}

/** Hebrew text for whatever went wrong. */
export function hebrewError(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)).toLowerCase();
  if (m.includes('invalid login')) return 'המייל או הסיסמה לא נכונים';
  if (m.includes('email not confirmed')) return 'צריך לאשר את המייל: נשלח אלייך קישור';
  if (m.includes('already registered') || m.includes('already been registered')) return 'כבר יש חשבון עם המייל הזה';
  if (m.includes('password') && m.includes('6')) return 'הסיסמה צריכה להיות באורך 6 תווים לפחות';
  if (m.includes('rate limit')) return 'יותר מדי ניסיונות. כדאי לחכות כמה דקות';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'אין חיבור לשרת. אם זה קישור של claude.ai, החשבונות עובדים באפליקציה המותקנת';
  if (m.includes('invite expired')) return 'קישור ההזמנה לא בתוקף';
  if (m.includes('row-level security')) return 'אין הרשאה לפעולה הזאת';
  if (m.includes('payload too large') || m.includes('exceeded')) return 'הקובץ גדול מדי לשרת';
  return 'משהו השתבש: ' + (e instanceof Error ? e.message : String(m));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ok = <T = any>(r: { data: unknown; error: unknown }): T => { if (r.error) throw r.error; return r.data as T; };

// ───────── account ─────────
export async function session(): Promise<Session | null> {
  if (!cloudConfig()) return null;
  try { return (await (await sb()).auth.getSession()).data.session; } catch { return null; }
}
export async function me(): Promise<Person | null> {
  const s = await session();
  if (!s) return null;
  const r = await (await sb()).from('people').select('id,username,display_name').eq('id', s.user.id).maybeSingle();
  return (r.data as Person | null) ?? { id: s.user.id, username: String(s.user.user_metadata?.username ?? ''), display_name: String(s.user.user_metadata?.display_name ?? '') };
}
/** E-mail notification choices for the signed-in person (only if the e-mail part was set up in Supabase). */
export async function mailPrefs(): Promise<{ email_notify: boolean; email_chat: boolean } | null> {
  const s = await session(); if (!s) return null;
  const r = await (await sb()).from('profiles').select('email_notify,email_chat').eq('id', s.user.id).maybeSingle();
  return r.error ? null : (r.data as { email_notify: boolean; email_chat: boolean } | null);
}
export async function setMailPref(field: 'email_notify' | 'email_chat', on: boolean): Promise<void> {
  const s = await session(); if (!s) return;
  ok(await (await sb()).from('profiles').update({ [field]: on }).eq('id', s.user.id));
}
export async function usernameFree(u: string): Promise<boolean> {
  return ok(await (await sb()).rpc('username_free', { p_username: u })) as boolean;
}
export async function signUp(f: { email: string; username: string; displayName: string; password: string; question: string; answer: string }): Promise<'in' | 'confirm'> {
  const c = await sb();
  const r = await c.auth.signUp({ email: f.email.trim(), password: f.password,
    options: { data: { username: f.username.trim(), display_name: f.displayName.trim() || f.username.trim(), question: f.question.trim(), answer: f.answer } } });
  ok(r);
  return r.data.session ? 'in' : 'confirm';
}
export async function signIn(email: string, password: string): Promise<void> {
  ok(await (await sb()).auth.signInWithPassword({ email: email.trim(), password }));
}
export async function signInWithGoogle(): Promise<void> {
  // Google refuses to sign in inside the claude.ai frame, so go through the installable site there.
  let framed = false; try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed || /claude\.ai|claudeusercontent/.test(location.href)) { window.open(appUrl() + '#google', '_blank', 'noopener'); return; }
  ok(await (await sb()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } }));
}
export async function signOut(): Promise<void> { await (await sb()).auth.signOut(); }
export async function recoveryQuestion(login: string): Promise<string | null> {
  return (ok(await (await sb()).rpc('recovery_question', { p_login: login.trim() })) as string | null) || null;
}
export async function recoverPassword(login: string, answer: string, pw: string): Promise<'ok' | 'wrong' | 'locked' | 'short'> {
  return ok(await (await sb()).rpc('recover_password', { p_login: login.trim(), p_answer: answer, p_new_password: pw })) as 'ok' | 'wrong' | 'locked' | 'short';
}
export async function setSecurity(question: string, answer: string): Promise<void> {
  ok(await (await sb()).rpc('set_security', { p_question: question, p_answer: answer }));
}

// ───────── friends ─────────
export async function friends(): Promise<Friend[]> {
  const c = await sb();
  const mine = (await session())?.user.id;
  const rows = ok(await c.from('friendships').select('requester,addressee,status')) as { requester: string; addressee: string; status: 'pending' | 'accepted' }[];
  const ids = rows.map((r) => (r.requester === mine ? r.addressee : r.requester));
  if (!ids.length) return [];
  const ppl = ok(await c.from('people').select('id,username,display_name').in('id', ids)) as Person[];
  return rows.map((r) => {
    const other = r.requester === mine ? r.addressee : r.requester;
    const p = ppl.find((x) => x.id === other) ?? { id: other, username: '?', display_name: '' };
    return { ...p, status: r.status, incoming: r.addressee === mine };
  });
}
export async function addFriend(username: string): Promise<Person> {
  const c = await sb();
  const found = (ok(await c.rpc('find_person', { p_username: username })) as Person[])[0];
  if (!found) throw new Error('לא מצאתי משתמשת בשם הזה');
  const mine = (await session())?.user.id;
  if (found.id === mine) throw new Error('זה השם שלך 🙂');
  const r = await c.from('friendships').insert({ requester: mine, addressee: found.id });
  if (r.error && !String(r.error.message).includes('duplicate')) throw r.error;
  return found;
}
export async function acceptFriend(id: string): Promise<void> {
  const c = await sb();
  ok(await c.from('friendships').update({ status: 'accepted' }).eq('requester', id).eq('addressee', (await session())!.user.id));
}
export async function removeFriend(id: string): Promise<void> {
  const c = await sb(); const mine = (await session())!.user.id;
  ok(await c.from('friendships').delete().or(`and(requester.eq.${mine},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${mine})`));
}

// ───────── groups ─────────
export async function groups(): Promise<Group[]> {
  return ok(await (await sb()).from('groups').select('id,name,icon,owner').order('created_at')) as Group[];
}
export async function createGroup(name: string, icon: string, memberIds: string[]): Promise<Group> {
  const c = await sb();
  const g = ok(await c.from('groups').insert({ name, icon }).select('id,name,icon,owner').single()) as Group;
  if (memberIds.length) ok(await c.from('group_members').insert(memberIds.map((user_id) => ({ group_id: g.id, user_id }))));
  return g;
}
export async function members(groupId: string): Promise<Person[]> {
  const c = await sb();
  const ids = (ok(await c.from('group_members').select('user_id').eq('group_id', groupId)) as { user_id: string }[]).map((r) => r.user_id);
  return ids.length ? ok(await c.from('people').select('id,username,display_name').in('id', ids)) as Person[] : [];
}
export async function addMember(groupId: string, userId: string): Promise<void> {
  ok(await (await sb()).from('group_members').insert({ group_id: groupId, user_id: userId }));
}
export async function leaveGroup(groupId: string): Promise<void> {
  const c = await sb();
  ok(await c.from('group_members').delete().eq('group_id', groupId).eq('user_id', (await session())!.user.id));
}
export async function deleteGroup(groupId: string): Promise<void> {
  ok(await (await sb()).from('groups').delete().eq('id', groupId));
}

// ───────── invite links ─────────
export function appUrl(): string {
  const here = location.href.split('#')[0];
  return /claude\.ai|claudeusercontent|localhost|127\.0\.0\.1/.test(here) ? 'https://miriamvoronov-spec.github.io/coloring-book/' : here;
}
export async function inviteLink(groupId: string): Promise<string> {
  const r = ok(await (await sb()).from('invites').insert({ group_id: groupId }).select('code').single()) as { code: string };
  return `${appUrl()}#join=${r.code}`;
}
export async function inviteInfo(code: string): Promise<{ group_id: string; name: string; icon: string } | null> {
  const rows = ok(await (await sb()).rpc('invite_info', { p_code: code })) as { group_id: string; name: string; icon: string }[];
  return rows[0] ?? null;
}
export async function joinGroup(code: string): Promise<string> {
  return ok(await (await sb()).rpc('join_group', { p_code: code })) as string;
}
/** An invite code that came in the link, kept until she signs in. */
export function pendingInvite(): string | null {
  const m = /[#&]join=([0-9a-f]{6,64})/i.exec(location.hash);
  if (m) { prefs.set('pendingJoin', m[1]); history.replaceState(null, '', location.href.split('#')[0]); }
  return prefs.get<string>('pendingJoin', '') || null;
}
export function clearPendingInvite(): void { prefs.del('pendingJoin'); }

// ───────── chat ─────────
export async function messages(groupId: string, limit = 200): Promise<Message[]> {
  const rows = ok(await (await sb()).from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit)) as Message[];
  return rows.reverse();
}
export async function send(groupId: string, body: string, bookId: string | null = null): Promise<void> {
  ok(await (await sb()).from('messages').insert({ group_id: groupId, body, book_id: bookId }));
}
export async function listen(groupId: string, onMsg: (m: Message) => void): Promise<() => void> {
  const c = await sb();
  const ch: RealtimeChannel = c.channel('chat-' + groupId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` }, (p) => onMsg(p.new as Message))
    .subscribe();
  return () => { void c.removeChannel(ch); };
}

// ───────── shared books ─────────
/** Upload a book (without anyone's colouring) and share it with friends and groups. */
export async function shareToCloud(book: BookMeta, to: { users: string[]; groups: string[] }, progress: (m: string) => void = () => {}): Promise<SharedBook> {
  const c = await sb();
  const { bookZip } = await import('./share');
  progress('אורזת את החוברת…');
  const pages = (await Promise.all(book.pageIds.map((id) => store.page(id)))).filter((p): p is PageRec => !!p);
  const zip = await bookZip(book, pages);
  const parts = Math.max(1, Math.ceil(zip.size / PART));
  const rec = ok(await c.from('shared_books').insert({ title: book.title, cover_color: book.coverColor || '#6b3a1f',
    pages: pages.filter((p) => p.kind === 'coloring').length, parts, bytes: zip.size }).select('*').single()) as SharedBook;
  try {
    for (let i = 0; i < parts; i++) {
      progress(parts > 1 ? `מעלה לשרת… ${i + 1}/${parts}` : 'מעלה לשרת…');
      ok(await c.storage.from('books').upload(`${rec.id}/part-${i}`, zip.slice(i * PART, (i + 1) * PART), { contentType: 'application/octet-stream', upsert: true }));
    }
  } catch (e) { await c.from('shared_books').delete().eq('id', rec.id); throw e; }
  const rows = [...to.users.map((u) => ({ book_id: rec.id, to_user: u })), ...to.groups.map((g) => ({ book_id: rec.id, to_group: g }))];
  if (rows.length) ok(await c.from('book_shares').insert(rows));
  for (const g of to.groups) await send(g, `📚 שיתפתי את החוברת "${book.title}"`, rec.id).catch(() => {});
  return rec;
}
/** Books others shared with me (and in my groups). */
export async function sharedWithMe(): Promise<(SharedBook & { from: string })[]> {
  const c = await sb(); const mine = (await session())?.user.id;
  const rows = ok(await c.from('shared_books').select('*').neq('owner', mine).order('created_at', { ascending: false })) as SharedBook[];
  const ids = [...new Set(rows.map((r) => r.owner))];
  const ppl = ids.length ? ok(await c.from('people').select('id,username,display_name').in('id', ids)) as Person[] : [];
  return rows.map((r) => { const p = ppl.find((x) => x.id === r.owner); return { ...r, from: p ? p.display_name || p.username : '' }; });
}
export async function sharedBook(id: string): Promise<SharedBook | null> {
  return (await (await sb()).from('shared_books').select('*').eq('id', id).maybeSingle()).data as SharedBook | null;
}
/** Download a shared book into this device's library. */
export async function importShared(b: SharedBook, cat: Category, progress: (m: string) => void = () => {}): Promise<BookMeta> {
  const c = await sb();
  const blobs: Blob[] = [];
  for (let i = 0; i < b.parts; i++) {
    progress(b.parts > 1 ? `מורידה… ${i + 1}/${b.parts}` : 'מורידה…');
    blobs.push(ok(await c.storage.from('books').download(`${b.id}/part-${i}`)) as Blob);
  }
  const { importFiles } = await import('./importer');
  return importFiles([new File(blobs, `${b.title}.colorbook`, { type: 'application/zip' })], cat, progress);
}
