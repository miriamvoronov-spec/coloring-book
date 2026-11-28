import { storedUserId } from '../app/account';
import { lockKind } from '../app/applock';
import { bioOn, bioName } from '../app/biolock';
import { DEVICE_HE, deviceKind, resetSizes, setSizes, sizes } from '../app/sizes';
/** Settings: her name (for the greeting), the app's look, sounds and sparkles, about. */
import { go } from '../app/app';
import { applySettings, CORNER_STYLES, dailyLine, greeting, greetingIcon, LINE_SETS, saveSettings, settings, THEMES, TITLE_FONTS, SCRIPT_FONTS, BOOK_FONTS } from '../app/settings';
import { ALL_TOOLS, DEFAULT_TOOLS, type ToolName } from '../coloring/brushes';
import { LOGO_STYLES, logoMark } from '../ui/logo';
import { chime, FLIP_SOUNDS, paperFlip, setOwnFlip, SPARKLE_SOUNDS, unlockAudio } from '../ui/sound';
import { h, toast } from '../ui/dom';
import { appBar } from '../ui/appbar';
import { categoriesScreen } from './categories';
import { prefs } from '../app/store';
import { CHANNELS, addOwnTracks, music, ownTracks, removeOwnTrack, setChannel, setVolume, type Channel } from '../ui/music';
import { exportLibrary, importLibrary } from '../app/backup';
import { saveFile } from '../app/runtime';

function lockRow(): HTMLElement {
  const names: Record<string, string> = { none: 'בלי נעילה', pattern: 'דפוס', pin: 'קוד מספרים', password: 'סיסמה' };
  const label = () => `עכשיו: ${names[lockKind()]}${bioOn() ? ` + ${bioName()}` : ''}`;
  const now = h('p', { class: 'muted' }, label());
  const btn = h('button', { class: 'btn btn--gold', type: 'button' }, '🔐 בחירת נעילה');
  btn.addEventListener('click', async () => { const { lockSheet } = await import('./friends'); lockSheet(() => { now.textContent = label(); }, () => { now.textContent = label(); }); });
  return h('div', { class: 'set-card' }, h('p', {}, 'מה האפליקציה מבקשת בכל פתיחה: דפוס כמו בטלפון, קוד מספרים, סיסמה או טביעת אצבע.'), now, btn);
}

function sizesCard(): HTMLElement {
  const box = h('div', { class: 'set-sizes' });
  const draw = () => {
    const z = sizes();
    const slider = (label: string, min: number, max: number, v: number, set: (n: number) => void) => {
      const out = h('span', { class: 'set-sizes__val' }, `${v}%`);
      const r = h('input', { type: 'range', class: 'slider', min, max, step: 2, value: v, 'aria-label': label }) as HTMLInputElement;
      r.addEventListener('input', () => { out.textContent = `${r.value}%`; set(Number(r.value)); });
      return h('label', { class: 'set-sizes__row' }, h('span', {}, label), r, out);
    };
    const fit = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'איך הדף ממלא את המסך' },
      ...([['whole', 'כל הדף נראה'], ['width', 'לרוחב המסך']] as const).map(([k, t]) =>
        h('button', { class: 'btn btn--small' + (z.fit === k ? ' btn--gold' : ''), type: 'button', role: 'radio', 'aria-checked': String(z.fit === k), onclick: () => { setSizes({ fit: k }); draw(); } }, t)));
    box.replaceChildren(
      h('p', { class: 'set-label' }, `המסך הזה: ${DEVICE_HE[deviceKind()]}. לכל סוג מסך (טלפון, טאבלט, מחשב) נשמרים גדלים משלו.`),
      slider('גודל החוברת הפתוחה', 50, 100, z.book, (n) => setSizes({ book: n })),
      slider('גודל הדף בזמן הצביעה', 50, 100, z.page, (n) => setSizes({ page: n })),
      h('div', { class: 'set-sizes__row' }, h('span', {}, 'הדף בצביעה'), fit),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => { resetSizes(); draw(); } }, 'חזרה לגודל הרגיל למסך הזה'));
  };
  draw();
  return box;
}

function section(title: string, ...kids: Node[]): HTMLElement {
  return h('section', { class: 'set-card' }, h('h2', { class: 'set-card__title' }, title), ...kids);
}

function toggle(label: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch__input', checked: on }) as HTMLInputElement;
  input.addEventListener('change', () => set(input.checked));
  return h('label', { class: 'switch' }, h('span', {}, label), input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
}

function radios(name: string, opts: [string, string][], value: string, set: (v: string) => void) {
  const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name });
  for (const [v, label] of opts) {
    const b = h('button', { class: 'seg__btn' + (v === value ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(v === value) }, label);
    b.addEventListener('click', () => { box.querySelectorAll('.seg__btn').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('is-on'); b.setAttribute('aria-checked', 'true'); set(v); });
    box.append(b);
  }
  return box;
}

export function settingsScreen(el: HTMLElement) {
  const s = settings();
  const hello = h('p', { class: 'set-hello' }, `${greetingIcon()} ${greeting()}`);
  const refreshHello = () => { hello.textContent = `${greetingIcon()} ${greeting()}`; };

  const name = h('input', { class: 'field', id: 'set-name', value: s.name, placeholder: 'השם שלך', maxlength: 30, autocomplete: 'given-name' }) as HTMLInputElement;
  name.addEventListener('input', () => { saveSettings({ name: name.value.trim() }); refreshHello(); });

  const themes = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'עיצוב' });
  for (const t of THEMES) {
    const b = h('button', { class: 'theme-choice' + (t.id === s.theme ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(t.id === s.theme) },
      h('span', { class: 'theme-choice__swatch', style: `background: linear-gradient(135deg, ${t.swatch[0]} 55%, ${t.swatch[1]} 55%)` }),
      h('span', {}, t.name));
    b.addEventListener('click', () => {
      themes.querySelectorAll('.theme-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
      saveSettings({ theme: t.id });
    });
    themes.append(b);
  }

  // her own theme, from the colour wheel
  const bg = h('input', { type: 'color', class: 'idea__wheel', value: s.customBg, 'aria-label': 'צבע הרקע מגלגל הצבעים' }) as HTMLInputElement;
  const ac = h('input', { type: 'color', class: 'idea__wheel', value: s.customAccent, 'aria-label': 'צבע ההדגשה מגלגל הצבעים' }) as HTMLInputElement;
  const useCustom = () => {
    themes.querySelectorAll('.theme-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
    custom.classList.add('is-on');
    saveSettings({ theme: 'custom', customBg: bg.value, customAccent: ac.value });
  };
  bg.addEventListener('input', useCustom); ac.addEventListener('input', useCustom);
  const custom = h('div', { class: 'theme-custom' + (s.theme === 'custom' ? ' is-on' : '') },
    h('span', { class: 'theme-custom__title' }, '🎨 העיצוב שלי מגלגל הצבעים'),
    h('label', { class: 'theme-custom__row' }, bg, 'רקע'),
    h('label', { class: 'theme-custom__row' }, ac, 'הדגשה וכפתורים'));
  themes.querySelectorAll('.theme-choice').forEach((b) => b.addEventListener('click', () => custom.classList.remove('is-on')));

  const fonts = h('div', { class: 'font-grid', role: 'radiogroup', 'aria-label': 'גופן הכותרות' });
  for (const f of TITLE_FONTS) {
    const b = h('button', { class: 'font-choice' + (f.id === s.titleFont ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(f.id === s.titleFont), style: `font-family: ${f.css}` },
      'הספרייה שלי');
    b.title = f.name;
    b.addEventListener('click', () => {
      fonts.querySelectorAll('.font-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
      saveSettings({ titleFont: f.id });
    });
    fonts.append(b);
  }

  // lettering of the app's name and of book names
  const fontPicker = (key: string, list: { id: string; name: string; css: string }[], sample: string) => {
    const box = h('div', { class: 'font-grid', role: 'radiogroup' });
    const cur = prefs.get(key, 'walt');
    for (const f of list) {
      const b = h('button', { class: 'font-choice' + (f.id === cur ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(f.id === cur), style: `font-family: ${f.css}, var(--font-display)`, title: f.name }, sample);
      b.addEventListener('click', () => {
        box.querySelectorAll('.font-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
        prefs.set(key, f.id); applySettings();
      });
      box.append(b);
    }
    return box;
  };
  const appFonts = fontPicker('appFont', SCRIPT_FONTS, "Miriam's");
  const bookFonts = fontPicker('bookFont', BOOK_FONTS, 'Les Classiques');

  // a background of several colours blended together
  const blendBox = h('div', { class: 'blend' });
  const blendPrev = h('div', { class: 'blend__preview', 'aria-hidden': 'true' });
  const renderBlend = () => {
    const cols = prefs.get<string[]>('bgBlend', []);
    const list = cols.length ? cols : [];
    blendBox.replaceChildren(...list.map((c, i) => {
      const inp = h('input', { type: 'color', class: 'idea__wheel', value: c, 'aria-label': `צבע ${i + 1}` }) as HTMLInputElement;
      inp.addEventListener('input', () => { const a = prefs.get<string[]>('bgBlend', []); a[i] = inp.value; prefs.set('bgBlend', a); applySettings(); paintPrev(); });
      const del = h('button', { class: 'icon-btn icon-btn--sm', type: 'button', 'aria-label': `להסיר את צבע ${i + 1}` }, '×');
      del.addEventListener('click', () => { const a = prefs.get<string[]>('bgBlend', []); a.splice(i, 1); prefs.set('bgBlend', a.length >= 2 ? a : []); applySettings(); renderBlend(); });
      return h('span', { class: 'blend__chip' }, inp, del);
    }));
    paintPrev();
  };
  const paintPrev = () => {
    const a = prefs.get<string[]>('bgBlend', []);
    blendPrev.style.background = a.length >= 2 ? `linear-gradient(${prefs.get('bgAngle', 160)}deg, ${a.join(', ')})` : 'radial-gradient(120% 90% at 50% 20%, var(--wood-2), var(--wood-1) 55%, var(--wood-0))';
  };
  const addCol = h('button', { class: 'btn', type: 'button' }, '＋ להוסיף צבע לרקע');
  addCol.addEventListener('click', () => {
    const a = prefs.get<string[]>('bgBlend', []);
    const next = a.length ? a : [getComputedStyle(document.documentElement).getPropertyValue('--wood-2').trim() || '#3b2a1e'];
    next.push(['#7b4bb5', '#e46aa0', '#3a7bd5', '#f2b84b', '#2e8b6a'][next.length % 5]);
    prefs.set('bgBlend', next); applySettings(); renderBlend();
  });
  const angle = radios('כיוון השילוב', [['160', 'אלכסון'], ['180', 'מלמעלה למטה'], ['90', 'מצד לצד'], ['135', 'אלכסון הפוך']], String(prefs.get('bgAngle', 160)), (v) => { prefs.set('bgAngle', Number(v)); applySettings(); paintPrev(); });
  const resetLook = h('button', { class: 'btn btn--ghost', type: 'button' }, '↺ חזרה לברירת המחדל');
  resetLook.addEventListener('click', () => {
    for (const k of ['bgBlend', 'bgAngle', 'theme', 'customBg', 'customAccent', 'titleFont', 'appFont', 'bookFont', 'logoStyle', 'corners']) prefs.del(k);
    applySettings(); toast('העיצוב חזר לברירת המחדל'); go(settingsScreen, 'none');
  });
  renderBlend();

  // her own page sound: pick a file, or record a page turning with the microphone
  const ownFlipPick = h('input', { type: 'file', accept: 'audio/*', hidden: true }) as HTMLInputElement;
  const ownFlipStatus = h('p', { class: 'set-label', role: 'status' });
  ownFlipPick.addEventListener('change', async () => {
    const f = ownFlipPick.files?.[0]; ownFlipPick.value = ''; if (!f) return;
    await setOwnFlip(f); ownFlipStatus.textContent = 'הצליל נשמר ונבחר ✓'; unlockAudio(); paperFlip('own');
  });
  let rec: MediaRecorder | null = null;
  const recBtn = h('button', { class: 'btn', type: 'button' }, '🎙️ להקליט דף מתהפך');
  recBtn.addEventListener('click', async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); rec = null; recBtn.textContent = '🎙️ להקליט דף מתהפך';
        await setOwnFlip(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }));
        ownFlipStatus.textContent = 'ההקלטה נשמרה ונבחרה ✓'; unlockAudio(); paperFlip('own');
      };
      rec.start(); recBtn.textContent = '⏹ לעצור (הפכי דף ליד המיקרופון)';
      setTimeout(() => { if (rec?.state === 'recording') rec.stop(); }, 4000);
    } catch { ownFlipStatus.textContent = 'אין גישה למיקרופון. אפשר לבחור קובץ צליל במקום.'; }
  });

  // ----- music -----
  const chSel = h('select', { class: 'field', id: 'set-ch' }) as HTMLSelectElement;
  for (const c of CHANNELS) chSel.append(h('option', { value: c.id }, `${c.icon} ${c.name}`));
  chSel.value = music.channel;
  const vol = h('input', { type: 'range', class: 'slider', min: 0, max: 100, value: Math.round(music.volume * 100), 'aria-label': 'ווליום המוזיקה' }) as HTMLInputElement;
  vol.addEventListener('input', () => setVolume(Number(vol.value) / 100));
  const ownList = h('ul', { class: 'own-list' });
  const ownPick = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true }) as HTMLInputElement;
  const renderOwn = async () => {
    const ch = chSel.value as Channel;
    const list = await ownTracks(ch);
    ownList.replaceChildren(...list.map((f, i) => h('li', {}, h('span', { dir: 'auto' }, '♪ ' + (f.name || `שיר ${i + 1}`)),
      h('button', { class: 'icon-btn icon-btn--sm', type: 'button', 'aria-label': 'הסרה', onclick: async () => { await removeOwnTrack(ch, i); void renderOwn(); } }, '×'))));
    if (!list.length) ownList.append(h('li', { class: 'muted' }, 'אין שירים משלך בערוץ הזה, מתנגנת המוזיקה המקורית של האפליקציה.'));
  };
  chSel.addEventListener('change', () => { void setChannel(chSel.value as Channel); void renderOwn(); });
  ownPick.addEventListener('change', async () => { const fs = [...(ownPick.files ?? [])]; ownPick.value = ''; if (fs.length) { await addOwnTracks(chSel.value as Channel, fs); toast('השירים נוספו לערוץ'); void renderOwn(); } });
  void renderOwn();

  // ----- logo and the daily line -----
  const logos = h('div', { class: 'logo-grid', role: 'radiogroup', 'aria-label': 'לוגו' });
  const curLogo = prefs.get('logoStyle', 'palettebook');
  for (const l of LOGO_STYLES) {
    const b = h('button', { class: 'logo-choice' + (l.id === curLogo ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(l.id === curLogo) },
      h('span', { class: 'logo-choice__art', html: logoMark(84, l.id) }), h('span', {}, l.name));
    b.addEventListener('click', () => {
      logos.querySelectorAll('.logo-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
      prefs.set('logoStyle', l.id);
    });
    logos.append(b);
  }
  const linePreview = h('p', { class: 'set-label line-preview' }, '“' + dailyLine() + '”');
  const lineSet = radios('סוג המשפט היומי', LINE_SETS.map((x) => [x.id, x.name] as [string, string]), prefs.get('lineSet', 'sweet'), (v) => { prefs.set('lineSet', v); linePreview.textContent = '“' + dailyLine(new Date(), v) + '”'; });

  // ----- toolbar and books -----
  const side = radios('מיקום סרגל הכלים', [['right', 'ימין'], ['left', 'שמאל'], ['top', 'למעלה'], ['bottom', 'למטה']], prefs.get('toolbarSide', 'right'), (v) => prefs.set('toolbarSide', v));
  const dir = radios('כיוון דפדוף', [['rtl', 'מימין לשמאל (עברית)'], ['ltr', 'משמאל לימין (אנגלית)']], prefs.get('defaultDirection', 'rtl'), (v) => prefs.set('defaultDirection', v));


  // ----- backup -----
  const restorePick = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true }) as HTMLInputElement;
  const backupStatus = h('p', { class: 'set-label', role: 'status' });
  const backupBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { const b = await exportLibrary((m) => { backupStatus.textContent = m; }); backupStatus.textContent = await saveFile(`miriam-library-${new Date().toISOString().slice(0, 10)}.zip`, b); }
    catch (e) { console.error(e); backupStatus.textContent = 'הגיבוי נכשל. אולי הספרייה גדולה מדי לגיבוי אחד.'; }
  } }, '💾 גיבוי כל הספרייה');
  restorePick.addEventListener('change', async () => {
    const f = restorePick.files?.[0]; restorePick.value = ''; if (!f) return;
    try { const n = await importLibrary(f, (m) => { backupStatus.textContent = m; }); backupStatus.textContent = `שוחזרו ${n} חוברות`; }
    catch (e) { backupStatus.textContent = e instanceof Error ? e.message : 'השחזור נכשל'; }
  });

  // ----- credits -----
  const credits = h('ul', { class: 'credits' },
    h('li', {}, 'הגופן Waltograph מאת mickeyavenue.com, לשימוש אישי ולא מסחרי (CC BY-NC-SA 1.0)'),
    h('li', {}, 'גופני Google Fonts: Heebo, Suez One, Secular One, Bellefair, Amatic SC, Karantina, Fredoka (SIL Open Font License)'),
    h('li', {}, 'הכתבים "קסם" בעברית: נבנו לאפליקציה מתוך Fredoka, Playpen Sans Hebrew ו-Gveret Levin (SIL Open Font License). כתבי שם האפליקציה Great Vibes, Princess Sofia, Dancing Script, Parisienne, Pacifico, Lobster, Cinzel Decorative, Mountains of Christmas (SIL Open Font License)'),
    h('li', {}, 'מוזיקה: 30 יצירות מקוריות שהאפליקציה מלחינה בזמן אמת, בלי תמלוגים. שירים שהוספת בעצמך נשארים רק במכשיר שלך'),
    h('li', {}, 'צלילי הדפדוף: הקלטות של דפי ספר אמיתיים מאת Kenney ("RPG Audio", ‏CC0)'),
    h('li', {}, 'pdf.js מאת Mozilla (Apache 2.0), jsPDF (MIT), fflate (MIT)'),
    h('li', {}, 'לוגו, כריכות, ציורי הדמו ואייקונים: נוצרו במיוחד לאפליקציה הזאת'));

  function toolChoices(): HTMLElement {
    const box = h('div', { class: 'tool-choices' });
    const on = new Set(prefs.get<ToolName[]>('tools.enabled', DEFAULT_TOOLS));
    for (const t of ALL_TOOLS) {
      box.append(toggle(`${t.name}: ${t.hint}`, on.has(t.id), (v) => {
        if (v) on.add(t.id); else on.delete(t.id);
        if (![...on].some((x) => x !== 'eraser' && x !== 'picker')) { on.add('marker'); toast('נשאר לפחות כלי צביעה אחד, אז הטוש נשאר'); }
        prefs.set('tools.enabled', ALL_TOOLS.map((x) => x.id).filter((x) => on.has(x)));
      }));
    }
    return box;
  }

  el.append(h('main', { class: 'settings' },
    appBar({ title: 'הגדרות', back: { label: 'חזרה לספרייה', to: () => go(categoriesScreen, 'back') }, settings: false }),
    h('div', { class: 'settings__body' },
      hello,
      section('איך לקרוא לך?', h('label', { for: 'set-name', class: 'set-label' }, 'השם יופיע בברכה לפי השעה: בוקר, צהריים, ערב ולילה'), name,
        toggle('להציג ברכה לפי השעה', prefs.get('showGreeting', true), (v) => { prefs.set('showGreeting', v); hello.hidden = !v; }),
        toggle('להציג משפט חמוד שמתחלף כל יום', prefs.get('showLine', true), (v) => prefs.set('showLine', v))),
      section('עיצוב האפליקציה', themes, custom),
      section('🌈 רקע משילוב צבעים', h('p', { class: 'set-label' }, 'שני צבעים או יותר שמתמזגים זה בזה לרקע של כל האפליקציה'), blendPrev, blendBox,
        h('div', { class: 'form__actions' }, addCol), angle),
      section('✒️ הכתב של שם האפליקציה', appFonts),
      section('📚 הכתב של שמות החוברות', h('p', { class: 'set-label' }, 'על הכריכה, השדרה ובראש הדף'), bookFonts),
      section('✨ לוגו', logos),
      section('💬 המשפט היומי', h('p', { class: 'set-label' }, 'איזה סוג משפטים יופיע במסך הפתיחה. המשפט מתחלף כל יום.'), lineSet, linePreview),
      section('גופן הכותרות', fonts),
      section('📏 גודל החוברת והדף', sizesCard()),
      section('📖 פינות מעוגלות בדף', h('p', { class: 'set-label' }, 'באיזה צד של הדף הפינות מעוגלות, כמו חוברת אמיתית'),
        radios('פינות מעוגלות', CORNER_STYLES.map((x) => [x.id, x.name] as [string, string]), prefs.get('corners', 'auto'), (v) => { prefs.set('corners', v); applySettings(); })),
      section('🖍️ כלי הצביעה בתפריט', h('p', { class: 'set-label' }, 'סמני אילו כלים יופיעו בתפריט הכלים בזמן הצביעה'), toolChoices()),
      section('🎵 מוזיקה',
        h('label', { for: 'set-ch', class: 'set-label' }, 'ערוץ'), chSel,
        h('label', { class: 'set-label' }, 'ווליום'), vol,
        h('p', { class: 'set-label' }, 'הנגן הקטן בפינה: ניגון, השתקה, הבא וּווליום. המוזיקה מתחילה רק אחרי נגיעה ראשונה, וזוכרת את הבחירה האחרונה.'),
        h('h3', { class: 'idea__h' }, 'שירים משלך לערוץ הזה'), ownList,
        h('button', { class: 'btn', type: 'button', onclick: () => ownPick.click() }, '＋ הוספת שירים מהמכשיר'), ownPick),
      section('קסם וצלילים',
        toggle('צלילי דפדוף וניצוצות קול', s.sounds, (v) => saveSettings({ sounds: v })),
        h('p', { class: 'set-label' }, 'צליל הדפדוף (לחיצה משמיעה אותו)'),
        radios('צליל הדפדוף', FLIP_SOUNDS.map((x) => [x.id, x.name] as [string, string]), prefs.get('flipSound', 'real'), (v) => { prefs.set('flipSound', v); unlockAudio(); paperFlip(v); }),
        h('p', { class: 'set-label' }, 'הצליל שלך: הקלטה של דף אמיתי (עד 4 שניות) או קובץ צליל מהמכשיר'),
        h('div', { class: 'form__actions' }, recBtn, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ownFlipPick.click() }, '📂 קובץ צליל')), ownFlipPick, ownFlipStatus,
        radios('צליל הניצוצות', SPARKLE_SOUNDS.map((x) => [x.id, x.name] as [string, string]), prefs.get('sparkleSound', 'chime'), (v) => { prefs.set('sparkleSound', v); unlockAudio(); chime(v); }),
        toggle('ניצוצות וקונפטי', s.sparkles, (v) => saveSettings({ sparkles: v }))),
      section('🖍️ סרגל הכלים', h('p', { class: 'set-label' }, 'איפה הסרגל יופיע (אפשר גם לגרור אותו בזמן הצביעה)'), side),
      section('📖 חוברות', h('p', { class: 'set-label' }, 'כיוון הדפדוף לחוברות חדשות שמוסיפים. לכל חוברת אפשר לשנות בלחיצה ארוכה במדף.'), dir),
      section('💾 גיבוי ושחזור', h('p', { class: 'set-label' }, 'כל החוברות והצביעה שלך בקובץ אחד, להעברה לטאבלט אחר או לשמירה.'),
        h('div', { class: 'form__actions' }, backupBtn, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => restorePick.click() }, '📂 שחזור מגיבוי')), restorePick, backupStatus),
      section('📲 התקנה במסך הבית', h('p', { class: 'set-label' }, 'אייקון במסך הבית שפותח את האפליקציה בלחיצה אחת.'),
        h('button', { class: 'btn btn--gold', type: 'button', onclick: async () => (await import('../ui/install')).installApp() }, '📲 להתקנה')),
      section('🌟 קרדיטים', credits),
      ...(storedUserId() ? [section('🔐 נעילת האפליקציה', lockRow())] : []),
      section('🔏 פרטיות', h('p', {}, 'מה נשמר ואיפה: ', h('a', { href: 'https://miriamvoronov-spec.github.io/coloring-book/privacy.html', target: '_blank', rel: 'noopener' }, 'מדיניות הפרטיות'))),
      section('↺ ברירת מחדל', h('p', { class: 'set-label' }, 'מחזיר את העיצוב, הרקע, הגופנים, הלוגו והפינות להתחלה. החוברות והצביעה לא נפגעות.'), resetLook),
      section('אודות', h('p', { class: 'set-about' }, "Miriam's Coloring Books. החוברות והצביעה נשמרות רק במכשיר הזה.")),
    )));
  const onLeave = () => toast('ההגדרות נשמרו');
  return () => { if (name.value.trim() !== s.name) onLeave(); };
}

/** Settings for creating books, shown inside "החוברות האישיות שלי". */
