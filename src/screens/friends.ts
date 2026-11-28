/**
 * "👭 חברות וקבוצות": account (sign up, sign in, forgotten password with a
 * security question), friends, unlimited groups with chat and invite links,
 * and books others shared with her.
 */
import { go } from '../app/app';
import { prefs, store } from '../app/store';
import type { BookMeta } from '../app/types';
import * as cloud from '../app/cloud';
import { appBar } from '../ui/appbar';
import { h, sheet, toast } from '../ui/dom';
import { categoriesScreen } from './categories';
import { bioAvailable, bioName, bioOn, bioUnlocked, disableBio, enableBio, markBioOpen, unlockBio } from '../app/biolock';
import { codeOpen, lockKind, markOpen, setLock, tryCode, waitSeconds, type LockKind } from '../app/applock';
import { codePad } from '../ui/lockpad';

const QUESTIONS = ['איך קראו לחיית המחמד הראשונה שלי?', 'באיזו עיר נולדתי?', 'מה שם בית הספר היסודי שלי?', 'מה המאכל שאני הכי אוהבת?', 'איך קוראים לחברה הכי טובה שלי מילדות?'];
const ICONS = ['💬', '🎨', '👭', '🌸', '🏰', '✨', '📚', '🦋', '💖', '🌙'];

function field(label: string, attrs: Record<string, string | boolean>): [HTMLElement, HTMLInputElement] {
  const id = 'f-' + Math.random().toString(36).slice(2, 8);
  const inp = h('input', { class: 'field', id, ...attrs }) as HTMLInputElement;
  return [h('div', { class: 'acct__row' }, h('label', { for: id }, label), inp), inp];
}
const busy = async (btn: HTMLButtonElement, out: HTMLElement, fn: () => Promise<void>) => {
  btn.disabled = true; out.textContent = '';
  try { await fn(); } catch (e) { console.error(e); out.textContent = e instanceof Error && !/^[a-z]/i.test(e.message) ? e.message : cloud.hebrewError(e); }
  finally { btn.disabled = false; }
};
const nameOf = (p: cloud.Person) => p.display_name || p.username;

export function friendsScreen(el: HTMLElement) {
  const body = h('div', { class: 'acct' });
  el.append(h('main', { class: 'friends-screen' },
    appBar({ title: '👭 חברות וקבוצות', back: { label: 'חזרה לספרייה', to: () => go(categoriesScreen, 'back') } }), body));
  let off: (() => void) | null = null;
  const render = async () => {
    off?.(); off = null;
    body.replaceChildren(h('p', { class: 'muted' }, 'רגע…'));
    if (!cloud.cloudConfig()) { body.replaceChildren(connectForm(render)); return; }
    const s = await cloud.session();
    if (!s && location.hash === '#google') {
      // Came here from the claude.ai copy to sign in with Google.
      history.replaceState(null, '', location.pathname + location.search);
      body.replaceChildren(h('p', { class: 'muted' }, 'עוברים לגוגל…'));
      try { await cloud.signInWithGoogle(); return; } catch (e) { console.error(e); }
    }
    if (!s) { body.replaceChildren(authForms(render)); return; }
    prefs.set('everSignedIn', true);
    let resetAsked = false; try { resetAsked = sessionStorage.getItem('mcb.resetLock') === '1'; } catch { /* fine */ }
    if (resetAsked) {
      // She proved who she is by signing in again: forget the old lock.
      try { sessionStorage.removeItem('mcb.resetLock'); } catch { /* fine */ }
      await setLock('none'); disableBio(); toast('הנעילה בוטלה. אפשר לבחור חדשה בכרטיס החשבון');
    }
    if (!bioUnlocked() || !codeOpen()) { body.replaceChildren(lockCard(render)); return; }
    const code = cloud.pendingInvite();
    if (code) {
      cloud.clearPendingInvite();
      try { const g = await cloud.joinGroup(code); toast('הצטרפת לקבוצה ✨'); const gr = (await cloud.groups()).find((x) => x.id === g); if (gr) { openGroup(gr, render); } }
      catch (e) { toast(cloud.hebrewError(e)); }
    }
    try { body.replaceChildren(await home(render)); }
    catch (e) { body.replaceChildren(h('p', { class: 'acct__err' }, cloud.hebrewError(e))); }
  };
  void render();
  return () => off?.();
}

/** Before the server is connected: where the two codes go. */
function connectForm(done: () => void): HTMLElement {
  const [r1, url] = field('Project URL', { type: 'url', dir: 'ltr', placeholder: 'https://xxxx.supabase.co' });
  const [r2, key] = field('anon public key', { dir: 'ltr', placeholder: 'eyJ…' });
  const save = h('button', { class: 'btn btn--gold', type: 'button' }, 'חיבור');
  const out = h('p', { class: 'acct__err', role: 'status' });
  save.addEventListener('click', () => {
    if (!/^https:\/\/.+/.test(url.value.trim()) || key.value.trim().length < 20) { out.textContent = 'צריך את שני הקודים מ-Supabase'; return; }
    cloud.setCloudConfig(url.value, key.value); done();
  });
  return h('section', { class: 'acct__card' },
    h('h2', {}, 'חיבור לשרת'),
    h('p', { class: 'muted' }, 'החשבונות, החברות והקבוצות נשמרים בשרת Supabase החינמי שלך. מעתיקים את שני הקודים מ-Supabase ← Project Settings ← API. עושים את זה פעם אחת.'),
    r1, r2, h('div', { class: 'form__actions' }, save), out);
}

/** Sign in, sign up and forgotten password. */
function authForms(done: () => void): HTMLElement {
  const wrap = h('div', { class: 'acct__auth' });
  const tabs = h('div', { class: 'acct__tabs', role: 'tablist' });
  const pane = h('section', { class: 'acct__card' });
  const show = (which: 'in' | 'up' | 'forgot') => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.t === which));
    pane.replaceChildren(which === 'in' ? signIn() : which === 'up' ? signUp() : forgot());
  };
  for (const [t, l] of [['up', '✨ הרשמה: חשבון חדש'], ['in', 'כניסה: כבר יש לי חשבון'], ['forgot', 'שכחתי סיסמה']] as const) {
    tabs.append(h('button', { class: 'acct__tab', type: 'button', 'data-t': t, onclick: () => show(t) }, l));
  }
  const invite = cloud.pendingInvite();
  if (invite) void cloud.inviteInfo(invite).then((g) => { if (g) wrap.prepend(h('p', { class: 'acct__invite' }, `${g.icon} הוזמנת לקבוצה "${g.name}". אחרי הכניסה או ההרשמה תצטרפי אליה.`)); }).catch(() => {});

  function signIn(): HTMLElement {
    const [a, email] = field('מייל', { type: 'email', dir: 'ltr', autocomplete: 'email' });
    const [b, pw] = field('סיסמה', { type: 'password', dir: 'ltr', autocomplete: 'current-password' });
    const go = h('button', { class: 'btn btn--gold', type: 'button' }, 'כניסה');
    const out = h('p', { class: 'acct__err', role: 'status' });
    go.addEventListener('click', () => void busy(go, out, async () => { await cloud.signIn(email.value, pw.value); done(); }));
    return h('div', { class: 'form' }, a, b, h('div', { class: 'form__actions' }, go), out);
  }
  function signUp(): HTMLElement {
    const [a, email] = field('מייל', { type: 'email', dir: 'ltr', autocomplete: 'email' });
    const [b, user] = field('שם משתמש (באנגלית, בלי רווחים)', { dir: 'ltr', autocomplete: 'username', placeholder: 'miriam' });
    const [c, disp] = field('השם שיופיע לחברות', { autocomplete: 'nickname' });
    const [d, pw] = field('סיסמה (6 תווים לפחות)', { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const [e, pw2] = field('הסיסמה שוב', { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const qSel = h('select', { class: 'field', id: 'q-sel' }, ...QUESTIONS.map((q) => h('option', { value: q }, q)), h('option', { value: '' }, 'שאלה משלי…')) as HTMLSelectElement;
    const [qr, qOwn] = field('השאלה שלי', {});
    qr.hidden = true;
    qSel.addEventListener('change', () => { qr.hidden = qSel.value !== ''; });
    const [f, ans] = field('התשובה (בשביל שחזור סיסמה)', { autocomplete: 'off' });
    const go = h('button', { class: 'btn btn--gold', type: 'button' }, 'יצירת חשבון');
    const out = h('p', { class: 'acct__err', role: 'status' });
    go.addEventListener('click', () => void busy(go, out, async () => {
      const u = user.value.trim();
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(u)) throw new Error('שם המשתמש: 3 עד 30 אותיות באנגלית, ספרות, נקודה או קו');
      if (pw.value.length < 6) throw new Error('הסיסמה צריכה להיות באורך 6 תווים לפחות');
      if (pw.value !== pw2.value) throw new Error('שתי הסיסמאות לא זהות');
      const question = qSel.value || qOwn.value.trim();
      if (!question || !ans.value.trim()) throw new Error('צריך שאלת אבטחה ותשובה, למקרה ששוכחים את הסיסמה');
      if (!(await cloud.usernameFree(u))) throw new Error('שם המשתמש הזה תפוס');
      const r = await cloud.signUp({ email: email.value, username: u, displayName: disp.value, password: pw.value, question, answer: ans.value });
      if (r === 'confirm') { out.textContent = 'נשלח אלייך מייל לאישור. אחרי האישור נכנסים כאן.'; return; }
      toast('ברוכה הבאה ✨'); done();
    }));
    return h('div', { class: 'form' }, a, b, c, d, e,
      h('div', { class: 'acct__row' }, h('label', { for: 'q-sel' }, 'שאלת אבטחה'), qSel), qr, f,
      h('div', { class: 'form__actions' }, go), out);
  }
  function forgot(): HTMLElement {
    const [a, login] = field('מייל או שם משתמש', { dir: 'ltr' });
    const ask = h('button', { class: 'btn', type: 'button' }, 'הצגת השאלה');
    const q = h('p', { class: 'acct__q' });
    const [b, ans] = field('התשובה', { autocomplete: 'off' });
    const [c, pw] = field('סיסמה חדשה', { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const step2 = h('div', { class: 'form', hidden: true }, q, b, c);
    const set = h('button', { class: 'btn btn--gold', type: 'button' }, 'שמירת סיסמה חדשה');
    step2.append(h('div', { class: 'form__actions' }, set));
    const out = h('p', { class: 'acct__err', role: 'status' });
    ask.addEventListener('click', () => void busy(ask, out, async () => {
      const question = await cloud.recoveryQuestion(login.value);
      if (!question) throw new Error('לא מצאתי חשבון כזה');
      q.textContent = question; step2.hidden = false;
    }));
    set.addEventListener('click', () => void busy(set, out, async () => {
      const r = await cloud.recoverPassword(login.value, ans.value, pw.value);
      if (r === 'wrong') throw new Error('התשובה לא נכונה');
      if (r === 'locked') throw new Error('היו יותר מדי ניסיונות. אפשר לנסות שוב בעוד שעה');
      if (r === 'short') throw new Error('הסיסמה צריכה להיות באורך 6 תווים לפחות');
      toast('הסיסמה הוחלפה. אפשר להיכנס'); show('in');
    }));
    return h('div', { class: 'form' }, a, h('div', { class: 'form__actions' }, ask), step2, out);
  }
  const google = h('button', { class: 'btn acct__google', type: 'button' }, h('span', { class: 'acct__g', 'aria-hidden': 'true' }, 'G'), ' הרשמה או כניסה עם גוגל');
  const gout = h('p', { class: 'acct__err', role: 'status' });
  google.addEventListener('click', () => void busy(google, gout, () => cloud.signInWithGoogle()));
  let framed = false; try { framed = window.top !== window || /claude\.ai|claudeusercontent/.test(location.href); } catch { framed = true; }
  const head = h('div', { class: 'acct__welcome' },
    h('h2', {}, 'חשבון אישי'),
    h('p', {}, 'עם חשבון אפשר להוסיף חברות, לפתוח קבוצות, לשתף חוברות ולשלוח ציורים לגלריה. ההרשמה בחינם ולוקחת דקה.'));
  if (framed) head.append(h('p', { class: 'acct__note' }, 'בתוך claude.ai ייתכן שהחיבור לשרת חסום. אם ההרשמה לא עוברת, פותחים את האפליקציה המותקנת:'),
    h('a', { class: 'btn btn--gold', href: cloud.appUrl() + '#friends', target: '_blank', rel: 'noopener' }, '📲 הרשמה באפליקציה המותקנת'));
  wrap.append(head, tabs, pane, h('div', { class: 'acct__card acct__oauth' }, h('p', { class: 'muted' }, 'או בלי למלא טופס:'), google, gout));
  show(prefs.get<boolean>('everSignedIn', false) ? 'in' : 'up');
  return wrap;
}

const LOCK_NAMES: Record<LockKind, string> = { none: 'בלי נעילה', pattern: 'דפוס', pin: 'קוד מספרים', password: 'סיסמה' };

/** The account is locked on this device: pattern / PIN / password, or fingerprint. */
function lockCard(render: () => void): HTMLElement {
  const kind = lockKind();
  const opened = () => { markOpen(); markBioOpen(); render(); };
  const msg = h('p', { class: 'acct__err', role: 'status' });
  const card = h('section', { class: 'acct__card acct__lock' }, h('h2', {}, '🔒 החשבון נעול'));
  if (kind !== 'none') {
    card.append(h('p', { class: 'muted' }, kind === 'pattern' ? 'מציירים את הדפוס' : kind === 'pin' ? 'מקלידים את הקוד' : 'מקלידים את הסיסמה'));
    const pad = codePad(kind, async (v) => {
      const w = waitSeconds();
      if (w > 0) { msg.textContent = `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${w} שניות`; pad.reset(true); return; }
      if (await tryCode(v)) opened();
      else { pad.reset(true); navigator.vibrate?.([30, 40, 30]); msg.textContent = waitSeconds() > 0 ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${waitSeconds()} שניות` : 'לא נכון. נסי שוב'; }
    });
    card.append(pad.el);
  }
  if (bioOn()) {
    const open = h('button', { class: 'btn btn--gold', type: 'button' }, `👆 פתיחה ב-${bioName()}`);
    open.addEventListener('click', async () => { if (await unlockBio()) opened(); else msg.textContent = 'לא הצלחתי לזהות. אפשר לנסות שוב'; });
    card.append(open);
    if (kind === 'none') void unlockBio().then((ok) => { if (ok) opened(); });
  }
  const forgot = h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
    try { sessionStorage.setItem('mcb.resetLock', '1'); } catch { /* fine */ }
    toast('נכנסים שוב לחשבון, והנעילה מתבטלת');
    await cloud.signOut();
    render();
  } }, 'שכחתי');
  card.append(msg, h('p', { class: 'muted' }, 'שכחת? "שכחתי" מוציא מהחשבון. אחרי שנכנסים שוב (במייל וסיסמה או עם גוגל), הנעילה מתבטלת.'), forgot);
  return card;
}

/** Choose this account's lock on this device, and enter the new code twice. */
function lockSheet(refresh: () => void): void {
  const body = h('div', { class: 'acct__locksheet' });
  const close = sheet('🔐 נעילת החשבון', body);
  const choose = () => {
    const now = lockKind();
    body.replaceChildren(h('p', { class: 'muted' }, 'איך לפתוח את החשבון במכשיר הזה? הבחירה שלך בלבד, ולכל משתמשת יש נעילה משלה.'),
      ...(['pattern', 'pin', 'password', 'none'] as LockKind[]).map((k) => h('button', { class: 'btn' + (k === now ? ' btn--gold' : ''), type: 'button', onclick: () => k === 'none' ? void setLock('none').then(() => { toast('בלי נעילה'); close(); refresh(); }) : enter(k as Exclude<LockKind, 'none'>) },
        { pattern: '⠿ דפוס (כמו בטלפון)', pin: '🔢 קוד מספרים', password: '🔤 סיסמה', none: '🔓 בלי נעילה' }[k])),
      h('p', { class: 'muted' }, `אפשר להוסיף גם ${bioName()} בכפתור שבכרטיס החשבון.`));
  };
  const enter = (k: Exclude<LockKind, 'none'>) => {
    let first = '';
    const tip = h('p', { class: 'muted' }, k === 'pattern' ? 'מציירים דפוס דרך 4 נקודות לפחות' : k === 'pin' ? 'מקלידים קוד של 4 ספרות לפחות' : 'מקלידים סיסמה של 4 תווים לפחות');
    const pad = codePad(k, async (v) => {
      if (v.length < 4) { tip.textContent = k === 'pattern' ? 'צריך לפחות 4 נקודות. נסי שוב' : 'צריך לפחות 4. נסי שוב'; pad.reset(true); return; }
      if (!first) { first = v; tip.textContent = 'עוד פעם, לאישור'; pad.reset(); return; }
      if (v !== first) { first = ''; tip.textContent = 'לא היה אותו דבר. מתחילים מהתחלה'; pad.reset(true); return; }
      await setLock(k, v); toast(`הנעילה: ${LOCK_NAMES[k]} 🔐`); close(); refresh();
    });
    body.replaceChildren(h('strong', {}, LOCK_NAMES[k]), tip, pad.el, h('button', { class: 'btn btn--small', type: 'button', onclick: choose }, 'חזרה'));
  };
  choose();
}

/** Signed in: friends, groups, shared books, account. */
async function home(refresh: () => void): Promise<HTMLElement> {
  const [mine, fr, gr, shared] = await Promise.all([cloud.me(), cloud.friends(), cloud.groups(), cloud.sharedWithMe().catch(() => [])]);
  const wrap = h('div', { class: 'acct__home' });

  // ── account
  const out = h('button', { class: 'btn btn--small', type: 'button', onclick: async () => { await cloud.signOut(); refresh(); } }, 'יציאה');
  const sec = h('button', { class: 'btn btn--small', type: 'button', onclick: () => securitySheet() }, 'שאלת אבטחה');
  const bio = h('button', { class: 'btn btn--small', type: 'button', hidden: true }, bioOn() ? `🔓 לבטל ${bioName()}` : `👆 כניסה ב-${bioName()}`);
  void bioAvailable().then((ok) => { bio.hidden = !ok && !bioOn(); });
  bio.addEventListener('click', async () => {
    if (bioOn()) { disableBio(); toast('בוטל'); refresh(); return; }
    try { await enableBio(mine?.username ?? ''); toast(`מעכשיו החשבון נפתח ב-${bioName()} 👆`); refresh(); }
    catch { toast(`לא הצלחתי להפעיל. צריך ${bioName()} מוגדר במכשיר, ולפתוח את האפליקציה המותקנת או את הדפדפן (לא מתוך claude.ai)`); }
  });
  const mailBox = h('div', { class: 'acct__mail', hidden: true });
  wrap.append(h('section', { class: 'acct__card acct__me' },
    h('div', {}, h('strong', {}, mine ? nameOf(mine) : ''), ' ', h('span', { class: 'muted', dir: 'ltr' }, mine ? '@' + mine.username : '')),
    h('div', { class: 'acct__btns' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => lockSheet(refresh) }, `🔐 נעילה: ${LOCK_NAMES[lockKind()]}`), bio, sec, out),
    mailBox));
  void cloud.mailPrefs().then((m) => {
    if (!m) return;
    const sw = (label: string, on: boolean, f: 'email_notify' | 'email_chat') => {
      const input = h('input', { type: 'checkbox', class: 'switch__input', checked: on }) as HTMLInputElement;
      input.addEventListener('change', () => { void cloud.setMailPref(f, input.checked).then(() => toast(input.checked ? 'יישלח מייל 📧' : 'לא יישלח מייל')).catch(() => { input.checked = !input.checked; toast('לא הצלחתי לשמור'); }); });
      return h('label', { class: 'switch' }, h('span', {}, label), input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
    };
    mailBox.replaceChildren(h('strong', { class: 'acct__mailtitle' }, '📧 התראות במייל'),
      sw('בקשות חברות, הוספה לקבוצה וחוברות ששיתפו איתי', m.email_notify, 'email_notify'),
      sw('הודעות בקבוצות (מייל אחד לחצי שעה לכל היותר)', m.email_chat, 'email_chat'));
    mailBox.hidden = false;
  });

  // ── friends
  const [addRow, addInp] = field('הוספת חברה לפי שם משתמש', { dir: 'ltr', placeholder: 'dana' });
  const add = h('button', { class: 'btn btn--gold btn--small', type: 'button' }, 'שליחת בקשה');
  const addOut = h('p', { class: 'acct__err', role: 'status' });
  add.addEventListener('click', () => void busy(add, addOut, async () => { const p = await cloud.addFriend(addInp.value); toast(`נשלחה בקשה ל-${nameOf(p)}`); refresh(); }));
  const list = h('ul', { class: 'acct__list' });
  for (const f of fr) {
    const li = h('li', { class: 'acct__item' }, h('span', { class: 'acct__name' }, nameOf(f), ' ', h('span', { class: 'muted', dir: 'ltr' }, '@' + f.username)));
    if (f.status === 'pending' && f.incoming) li.append(h('button', { class: 'btn btn--gold btn--small', type: 'button', onclick: async () => { await cloud.acceptFriend(f.id); refresh(); } }, 'אישור'));
    else if (f.status === 'pending') li.append(h('span', { class: 'muted' }, 'ממתינה לאישור'));
    li.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'הסרה', title: 'הסרה', onclick: async () => { if (confirmTwice(li)) { await cloud.removeFriend(f.id); refresh(); } } }, '✕'));
    list.append(li);
  }
  if (!fr.length) list.append(h('li', { class: 'muted' }, 'עוד אין חברות. מוסיפים לפי שם המשתמש שלהן, או שולחים להן קישור הזמנה לקבוצה.'));
  wrap.append(h('section', { class: 'acct__card' }, h('h2', {}, '👭 חברות ואנשי קשר'), list, addRow, h('div', { class: 'form__actions' }, add), addOut));

  // ── groups
  const glist = h('div', { class: 'acct__groups' });
  for (const g of gr) glist.append(h('button', { class: 'group-card', type: 'button', onclick: () => openGroup(g, refresh) }, h('span', { class: 'group-card__icon' }, g.icon), h('span', {}, g.name)));
  const newG = h('button', { class: 'group-card group-card--add', type: 'button', onclick: () => newGroup(fr.filter((f) => f.status === 'accepted'), refresh) }, h('span', { class: 'group-card__icon' }, '＋'), h('span', {}, 'קבוצה חדשה'));
  glist.append(newG);
  wrap.append(h('section', { class: 'acct__card' }, h('h2', {}, '💬 קבוצות'), glist));

  // ── shared with me
  const slist = h('ul', { class: 'acct__list' });
  const have = new Set((await store.books()).map((b) => b.title));
  for (const b of shared) {
    const get = h('button', { class: 'btn btn--small' + (have.has(b.title) ? '' : ' btn--gold'), type: 'button' }, have.has(b.title) ? 'להוסיף שוב' : '📥 להוסיף לספרייה');
    get.addEventListener('click', () => void downloadShared(b, get));
    slist.append(h('li', { class: 'acct__item' },
      h('span', { class: 'acct__swatch', style: `background:${b.cover_color}` }),
      h('span', { class: 'acct__name', dir: 'auto' }, b.title, ' ', h('span', { class: 'muted' }, `· ${b.pages} דפים · מ${b.from}`)), get));
  }
  if (!shared.length) slist.append(h('li', { class: 'muted' }, 'כשחברה תשתף איתך חוברת, היא תופיע כאן.'));
  wrap.append(h('section', { class: 'acct__card' }, h('h2', {}, '📚 חוברות ששיתפו איתי'), slist));

  // ── gallery of finished pages (needs gallery.sql in Supabase)
  const gal = h('div', { class: 'gal' }, h('p', { class: 'muted' }, 'רגע…'));
  const galCard = h('section', { class: 'acct__card' }, h('h2', {}, '🖼️ הגלריה'), gal);
  wrap.append(galCard);
  void cloud.gallery().then((arts) => {
    gal.replaceChildren();
    if (!arts.length) { gal.append(h('p', { class: 'muted' }, 'כאן יופיעו ציורים גמורים שלך ושל החברות. משתפים ציור מתוך הדף: "שיתוף" ואז "🖼️ לגלריה של החברות".')); return; }
    for (const a of arts) {
      const img = h('img', { src: a.url, alt: a.title || 'ציור', loading: 'lazy' });
      gal.append(h('button', { class: 'gal__tile', type: 'button', onclick: () => artSheet(a, refresh) }, img,
        h('span', { class: 'gal__who' }, a.mine ? 'שלי' : a.from)));
    }
  }).catch(() => { galCard.remove(); });
  return wrap;
}

/** One finished page, big, with who coloured it. */
function artSheet(a: cloud.Art, refresh: () => void): void {
  const when = new Date(a.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  const del = h('button', { class: 'btn btn--small', type: 'button' }, 'הסרה מהגלריה');
  del.addEventListener('click', async () => { if (!confirmTwice(del)) return; await cloud.deleteArt(a); toast('הוסר'); close(); refresh(); });
  const close = sheet(a.title || 'ציור', h('div', { class: 'gal__big' },
    h('img', { src: a.url, alt: a.title || 'ציור' }),
    h('p', {}, h('strong', {}, a.mine ? 'הציור שלי' : `צבעה: ${a.from}`), ' · ', h('span', { class: 'muted' }, when)),
    ...(a.mine ? [del] : [])));
}

function confirmTwice(el: HTMLElement): boolean {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1'; toast('לחיצה נוספת להסרה'); setTimeout(() => delete el.dataset.armed, 3000);
  return false;
}

async function downloadShared(b: cloud.SharedBook, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  const cats = await store.categories();
  const cat = cats.find((c) => c.role === 'imported') ?? cats[0];
  try {
    const book = await cloud.importShared(b, cat, (m) => { btn.textContent = m; });
    dispatchEvent(new CustomEvent('mcb:books-changed'));
    btn.textContent = '✓ נוספה';
    toast(`"${book.title}" נוספה למדף ${cat.name}`);
  } catch (e) { btn.disabled = false; btn.textContent = '📥 לנסות שוב'; toast(cloud.hebrewError(e)); }
}

function securitySheet(): void {
  const sel = h('select', { class: 'field', id: 'sq' }, ...QUESTIONS.map((q) => h('option', { value: q }, q))) as HTMLSelectElement;
  const [r, ans] = field('התשובה החדשה', { autocomplete: 'off' });
  const save = h('button', { class: 'btn btn--gold', type: 'button' }, 'שמירה');
  const out = h('p', { class: 'acct__err', role: 'status' });
  const close = sheet('שאלת אבטחה', h('div', { class: 'form' }, h('label', { for: 'sq' }, 'השאלה'), sel, r, h('div', { class: 'form__actions' }, save), out));
  save.addEventListener('click', () => void busy(save, out, async () => {
    if (!ans.value.trim()) throw new Error('צריך תשובה');
    await cloud.setSecurity(sel.value, ans.value); toast('נשמר'); close();
  }));
}

function pickPeople(people: cloud.Person[], checked: Set<string> = new Set()): [HTMLElement, () => string[]] {
  const box = h('div', { class: 'pick-pages' });
  const cbs = people.map((p) => {
    const id = 'pp-' + p.id;
    const cb = h('input', { type: 'checkbox', id, checked: checked.has(p.id) }) as HTMLInputElement;
    box.append(h('label', { class: 'pick-pages__item', for: id }, cb, h('span', {}, nameOf(p))));
    return cb;
  });
  if (!people.length) box.append(h('p', { class: 'muted' }, 'עוד אין חברות מאושרות. אפשר להזמין לקבוצה גם בקישור.'));
  return [box, () => people.filter((_, i) => cbs[i].checked).map((p) => p.id)];
}

function newGroup(friends: cloud.Person[], done: () => void): void {
  const [r, name] = field('שם הקבוצה', {});
  let icon = ICONS[0];
  const icons = h('div', { class: 'acct__icons' });
  for (const i of ICONS) {
    const b = h('button', { class: 'acct__icon' + (i === icon ? ' is-on' : ''), type: 'button' }, i);
    b.addEventListener('click', () => { icon = i; icons.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); });
    icons.append(b);
  }
  const [who, chosen] = pickPeople(friends);
  const make = h('button', { class: 'btn btn--gold', type: 'button' }, 'יצירת הקבוצה');
  const out = h('p', { class: 'acct__err', role: 'status' });
  const close = sheet('קבוצה חדשה', h('div', { class: 'form' }, r, h('label', {}, 'סמל'), icons, h('label', {}, 'מי בקבוצה'), who, h('div', { class: 'form__actions' }, make), out));
  make.addEventListener('click', () => void busy(make, out, async () => {
    if (!name.value.trim()) throw new Error('צריך שם לקבוצה');
    const g = await cloud.createGroup(name.value.trim(), icon, chosen());
    close(); done(); openGroup(g, done);
  }));
}

/** One group: chat, members, invite link, share a book. */
function openGroup(g: cloud.Group, refresh: () => void): void {
  const log = h('div', { class: 'chat__log', 'aria-live': 'polite' });
  const input = h('input', { class: 'field chat__input', placeholder: 'הודעה…', 'aria-label': 'הודעה' }) as HTMLInputElement;
  const sendBtn = h('button', { class: 'btn btn--gold', type: 'button' }, 'שליחה');
  const people = new Map<string, cloud.Person>();
  let mineId = '';
  const bubble = (m: cloud.Message) => {
    const p = people.get(m.sender);
    const b = h('div', { class: 'chat__msg' + (m.sender === mineId ? ' chat__msg--me' : '') },
      h('span', { class: 'chat__who' }, p ? nameOf(p) : ''),
      h('span', { class: 'chat__body', dir: 'auto' }, m.body),
      h('span', { class: 'chat__time' }, new Date(m.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })));
    if (m.book_id) {
      const get = h('button', { class: 'btn btn--small btn--gold', type: 'button' }, '📥 להוסיף לספרייה');
      get.addEventListener('click', async () => { const sb = await cloud.sharedBook(m.book_id!); if (sb) void downloadShared(sb, get); else toast('החוברת כבר לא משותפת'); });
      b.append(get);
    }
    log.append(b); log.scrollTop = log.scrollHeight;
  };
  const doSend = async () => {
    const t = input.value.trim(); if (!t) return;
    input.value = '';
    try { await cloud.send(g.id, t); } catch (e) { toast(cloud.hebrewError(e)); input.value = t; }
  };
  sendBtn.addEventListener('click', () => void doSend());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doSend(); });

  const invite = h('button', { class: 'btn btn--small', type: 'button' }, '🔗 קישור הזמנה');
  invite.addEventListener('click', async () => {
    try {
      const url = await cloud.inviteLink(g.id);
      const text = `הזמנה לקבוצה "${g.name}" ב-Miriam's Coloring Books`;
      if (navigator.share) { try { await navigator.share({ title: text, text, url }); return; } catch { /* closed */ } }
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast('הקישור הועתק. אפשר להדביק בוואטסאפ');
    } catch (e) { toast(cloud.hebrewError(e)); }
  });
  const shareBtn = h('button', { class: 'btn btn--small', type: 'button' }, '📚 שיתוף חוברת');
  shareBtn.addEventListener('click', async () => {
    const books = (await store.books()).filter((b) => !b.demo);
    const list = h('ul', { class: 'acct__list' });
    const close = sheet(`שיתוף חוברת ב${g.name}`, h('div', { class: 'form' }, list));
    for (const b of books) {
      const btn = h('button', { class: 'btn btn--small', type: 'button' }, 'שיתוף');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await cloud.shareToCloud(b, { users: [], groups: [g.id] }, (m) => { btn.textContent = m; }); toast('שותפה ✨'); close(); }
        catch (e) { btn.disabled = false; btn.textContent = 'שיתוף'; toast(cloud.hebrewError(e)); }
      });
      list.append(h('li', { class: 'acct__item' }, h('span', { class: 'acct__name', dir: 'auto' }, b.title), btn));
    }
    if (!books.length) list.append(h('li', { class: 'muted' }, 'אין עדיין חוברות בספרייה'));
  });
  const memBox = h('div', { class: 'chat__members muted' });
  const addMem = h('button', { class: 'btn btn--small', type: 'button' }, '＋ חברה');
  const leave = h('button', { class: 'btn btn--small btn--danger', type: 'button' }, 'יציאה מהקבוצה');
  const body = h('div', { class: 'chat' },
    h('div', { class: 'chat__bar' }, memBox, h('div', { class: 'acct__btns' }, invite, shareBtn, addMem, leave)),
    log, h('div', { class: 'chat__send' }, input, sendBtn));
  let stop: (() => void) | null = null;
  const close = sheet(`${g.icon} ${g.name}`, body, () => { stop?.(); refresh(); });
  body.closest('.sheet')?.classList.add('sheet--wide');

  void (async () => {
    try {
      mineId = (await cloud.session())?.user.id ?? '';
      const mem = await cloud.members(g.id);
      mem.forEach((p) => people.set(p.id, p));
      memBox.textContent = mem.map(nameOf).join(' · ');
      if (g.owner === mineId) leave.textContent = 'מחיקת הקבוצה';
      (await cloud.messages(g.id)).forEach(bubble);
      if (!log.children.length) log.append(h('p', { class: 'muted' }, 'עוד אין הודעות. אפשר לכתוב, לשתף חוברת או לשלוח קישור הזמנה.'));
      stop = await cloud.listen(g.id, async (m) => {
        if (!people.has(m.sender)) (await cloud.members(g.id)).forEach((p) => people.set(p.id, p));
        log.querySelector(':scope > p.muted')?.remove();
        bubble(m);
      });
    } catch (e) { log.replaceChildren(h('p', { class: 'acct__err' }, cloud.hebrewError(e))); }
  })();

  addMem.addEventListener('click', async () => {
    const fr = (await cloud.friends()).filter((f) => f.status === 'accepted' && !people.has(f.id));
    const [who, chosen] = pickPeople(fr);
    const ok = h('button', { class: 'btn btn--gold', type: 'button' }, 'הוספה');
    const c2 = sheet('הוספה לקבוצה', h('div', { class: 'form' }, who, h('div', { class: 'form__actions' }, ok)));
    ok.addEventListener('click', async () => {
      try { for (const id of chosen()) await cloud.addMember(g.id, id); toast('נוספו'); c2(); close(); openGroup(g, refresh); }
      catch (e) { toast(cloud.hebrewError(e)); }
    });
  });
  leave.addEventListener('click', async () => {
    if (!confirmTwice(leave)) return;
    try { if (g.owner === mineId) await cloud.deleteGroup(g.id); else await cloud.leaveGroup(g.id); close(); }
    catch (e) { toast(cloud.hebrewError(e)); }
  });
}

/** After a book is added: share it? With whom? (Only when signed in.) */
export async function askToShare(book: BookMeta): Promise<void> {
  if (!cloud.cloudConfig() || !(await cloud.session())) return;
  let fr: cloud.Friend[] = [], gr: cloud.Group[] = [];
  try { [fr, gr] = await Promise.all([cloud.friends(), cloud.groups()]); } catch { return; }
  const accepted = fr.filter((f) => f.status === 'accepted');
  if (!accepted.length && !gr.length) return;
  const [who, chosenPeople] = pickPeople(accepted);
  const gbox = h('div', { class: 'pick-pages' });
  const gcbs = gr.map((g) => { const id = 'pg-' + g.id; const cb = h('input', { type: 'checkbox', id }) as HTMLInputElement; gbox.append(h('label', { class: 'pick-pages__item', for: id }, cb, h('span', {}, `${g.icon} ${g.name}`))); return cb; });
  const yes = h('button', { class: 'btn btn--gold', type: 'button' }, 'שיתוף');
  const no = h('button', { class: 'btn', type: 'button' }, 'לא עכשיו');
  const out = h('p', { class: 'muted', role: 'status' });
  const close = sheet('לשתף את החוברת?', h('div', { class: 'form' },
    h('p', {}, `"${book.title}" נוספה למדף. לשתף אותה (בלי הצביעה)?`),
    accepted.length ? h('label', {}, 'חברות') : null, accepted.length ? who : null,
    gr.length ? h('label', {}, 'קבוצות') : null, gr.length ? gbox : null,
    h('div', { class: 'form__actions' }, yes, no), out));
  no.addEventListener('click', () => close());
  yes.addEventListener('click', () => void busy(yes, out, async () => {
    const users = chosenPeople(); const groups = gr.filter((_, i) => gcbs[i].checked).map((g) => g.id);
    if (!users.length && !groups.length) throw new Error('בחרי עם מי לשתף');
    await cloud.shareToCloud(book, { users, groups }, (m) => { out.textContent = m; });
    toast('שותפה ✨'); close();
  }));
}

/** From a book's edit sheet: share with friends or groups. */
export async function shareWithFriends(book: BookMeta): Promise<void> {
  if (!cloud.cloudConfig() || !(await cloud.session())) {
    toast('כדי לשתף עם חברות צריך להיכנס לחשבון'); go(friendsScreen, 'forward'); return;
  }
  await askToShareAlways(book);
}
async function askToShareAlways(book: BookMeta): Promise<void> {
  const [fr, gr] = await Promise.all([cloud.friends(), cloud.groups()]);
  if (!fr.some((f) => f.status === 'accepted') && !gr.length) { toast('עוד אין חברות או קבוצות'); go(friendsScreen, 'forward'); return; }
  await askToShare(book);
}
