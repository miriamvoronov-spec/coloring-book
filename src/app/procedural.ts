/**
 * Built-in drawings that need no internet and no AI: mandalas, flower
 * gardens and stained-glass windows, made from flat shapes. The idea text
 * picks the colours and the layout, so the same idea gives the same page.
 * The result is the same kind of flat SVG the AI draws, so the rest of the
 * pipeline (outlines, regions, numbers, key, solution) is shared.
 */
import type { ArtStyle, Level } from './creator';

function seeded(text: string): () => number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const PALETTES: [string, string[]][] = [
  ['(?:^|\\s)ים(?:\\s|$)|אוקיינוס|כחול|גל|לילה|ירח|כוכב|חורף|שלג|קרח', ['#1d3557', '#457b9d', '#a8dadc', '#f1faee', '#e9c46a', '#6d597a', '#2a9d8f', '#bde0fe', '#5e548e', '#ffd166', '#264653', '#cdb4db']],
  ['פרח|ורד|גן|אביב|פרפר|לב|אהבה|ורוד', ['#ff8fab', '#fb6f92', '#ffc2d1', '#a7c957', '#6a994e', '#ffe5ec', '#f9c74f', '#c77dff', '#90be6d', '#e76f51', '#fff3b0', '#577590']],
  ['יער|עץ|עלה|טבע|ירוק|דשא|צמח|בוטני', ['#2d6a4f', '#40916c', '#95d5b2', '#d8f3dc', '#bc6c25', '#dda15e', '#fefae0', '#606c38', '#ffb703', '#8ecae6', '#b5838d', '#386641']],
  ['שקיעה|סתיו|אש|שמש|תפוז|לימון|הדר|קיץ|חם', ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#ffddd2', '#9d0208', '#ffba08', '#e85d04', '#6a4c93']],
  ['', ['#6a4c93', '#1982c4', '#8ac926', '#ffca3a', '#ff595e', '#f4a261', '#2a9d8f', '#e9c46a', '#cdb4db', '#ffafcc', '#a2d2ff', '#264653']],
];

function palette(idea: string, n: number, rnd: () => number): string[] {
  const base = (PALETTES.find(([k]) => k && new RegExp(k).test(idea)) ?? PALETTES[PALETTES.length - 1])[1].slice();
  for (let i = base.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  return base.slice(0, Math.max(3, Math.min(n, base.length)));
}

const f = (n: number) => n.toFixed(1);
const ringCounts: Record<Level, number[]> = { 1: [6, 8], 2: [8, 12, 16], 3: [10, 14, 20, 28] };

function mandala(rnd: () => number, pal: string[], level: Level): string {
  const cx = 500, cy = 640, out: string[] = [];
  const pick = (i: number) => pal[i % pal.length];
  out.push(`<rect x="0" y="0" width="1000" height="1400" fill="${pick(0)}"/>`);
  // corner ornaments and a frame band
  out.push(`<rect x="40" y="40" width="920" height="1320" fill="${pick(1)}"/>`, `<rect x="70" y="70" width="860" height="1260" fill="${pick(2)}"/>`);
  for (const [x, y] of [[70, 70], [930, 70], [70, 1330], [930, 1330]]) out.push(`<circle cx="${x}" cy="${y}" r="90" fill="${pick(3)}"/>`, `<circle cx="${x}" cy="${y}" r="45" fill="${pick(4)}"/>`);
  const rings = ringCounts[level];
  let R = 430;
  out.push(`<circle cx="${cx}" cy="${cy}" r="${R + 20}" fill="${pick(5)}"/>`);
  rings.slice().reverse().forEach((count, ri) => {
    const r0 = R * 0.55, petal = R - r0;
    const shape = Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + (ri % 2 ? Math.PI / count : 0);
      const w = (Math.PI * 2 / count) * 0.5;
      const p = (ang: number, rad: number) => `${f(cx + Math.cos(ang) * rad)},${f(cy + Math.sin(ang) * rad)}`;
      const col = pick(ri * 2 + 1 + (k % 2));
      if (shape === 0) out.push(`<path d="M${p(a - w, r0)} Q${p(a - w * 1.1, r0 + petal * 0.8)} ${p(a, R)} Q${p(a + w * 1.1, r0 + petal * 0.8)} ${p(a + w, r0)} Z" fill="${col}"/>`);
      else if (shape === 1) out.push(`<polygon points="${p(a - w, r0)} ${p(a - w * 0.6, R * 0.92)} ${p(a, R)} ${p(a + w * 0.6, R * 0.92)} ${p(a + w, r0)}" fill="${col}"/>`);
      else { const mid = (r0 + R) / 2; out.push(`<circle cx="${f(cx + Math.cos(a) * mid)}" cy="${f(cy + Math.sin(a) * mid)}" r="${f(Math.max(18, Math.min(petal * 0.45, mid * w * 0.9)))}" fill="${col}"/>`); }
    }
    R = r0 + petal * 0.08;
    out.push(`<circle cx="${cx}" cy="${cy}" r="${f(R)}" fill="${pick(ri + 6)}"/>`);
  });
  out.push(`<circle cx="${cx}" cy="${cy}" r="${f(Math.max(40, R * 0.6))}" fill="${pick(2)}"/>`, `<circle cx="${cx}" cy="${cy}" r="${f(Math.max(20, R * 0.3))}" fill="${pick(4)}"/>`);
  // a row of little hearts / drops at the bottom
  const n = level === 1 ? 4 : level === 2 ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const x = 150 + (700 / (n - 1)) * i, y = 1200;
    out.push(`<path d="M${x} ${y + 40} C${x - 60} ${y - 10} ${x - 30} ${y - 60} ${x} ${y - 25} C${x + 30} ${y - 60} ${x + 60} ${y - 10} ${x} ${y + 40} Z" fill="${pick(i + 3)}"/>`);
  }
  return out.join('');
}

function garden(rnd: () => number, pal: string[], level: Level): string {
  const out: string[] = [];
  const pick = (i: number) => pal[i % pal.length];
  out.push(`<rect x="0" y="0" width="1000" height="1400" fill="${pick(0)}"/>`);
  // sky bands and hills
  out.push(`<rect x="0" y="0" width="1000" height="560" fill="${pick(1)}"/>`, `<circle cx="790" cy="220" r="110" fill="${pick(2)}"/>`);
  out.push(`<path d="M0 640 Q250 460 520 600 T1000 560 L1000 1400 L0 1400 Z" fill="${pick(3)}"/>`, `<path d="M0 860 Q300 720 600 840 T1000 800 L1000 1400 L0 1400 Z" fill="${pick(4)}"/>`);
  const n = level === 1 ? 4 : level === 2 ? 7 : 11;
  for (let i = 0; i < n; i++) {
    const x = 110 + rnd() * 780, y = 760 + rnd() * 480, s = (level === 1 ? 1.25 : level === 2 ? 1 : 0.8) * (60 + rnd() * 40);
    out.push(`<polygon points="${f(x - 8)},${f(y)} ${f(x + 8)},${f(y)} ${f(x + 8)},1400 ${f(x - 8)},1400" fill="${pick(5)}"/>`);
    out.push(`<path d="M${f(x)} ${f(y + s * 1.5)} Q${f(x + s * 1.4)} ${f(y + s * 1.1)} ${f(x + s * 1.2)} ${f(y + s * 2)} Q${f(x + s * 0.5)} ${f(y + s * 2.1)} ${f(x)} ${f(y + s * 1.5)} Z" fill="${pick(6)}"/>`);
    const petals = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      out.push(`<ellipse cx="${f(x + Math.cos(a) * s * 0.75)}" cy="${f(y + Math.sin(a) * s * 0.75)}" rx="${f(s * 0.5)}" ry="${f(s * 0.5)}" fill="${pick(i + 7 + (k % 2))}"/>`);
    }
    out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.45)}" fill="${pick(i + 2)}"/>`);
  }
  // butterflies
  for (let i = 0; i < (level === 1 ? 1 : 2); i++) {
    const x = 180 + rnd() * 640, y = 160 + rnd() * 300, s = 55;
    out.push(`<ellipse cx="${f(x - s * 0.7)}" cy="${f(y - s * 0.3)}" rx="${s * 0.8}" ry="${s * 0.6}" fill="${pick(8 + i)}"/>`, `<ellipse cx="${f(x + s * 0.7)}" cy="${f(y - s * 0.3)}" rx="${s * 0.8}" ry="${s * 0.6}" fill="${pick(8 + i)}"/>`,
      `<ellipse cx="${f(x - s * 0.5)}" cy="${f(y + s * 0.5)}" rx="${s * 0.5}" ry="${s * 0.45}" fill="${pick(9 + i)}"/>`, `<ellipse cx="${f(x + s * 0.5)}" cy="${f(y + s * 0.5)}" rx="${s * 0.5}" ry="${s * 0.45}" fill="${pick(9 + i)}"/>`,
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="12" ry="${s}" fill="${pick(5)}"/>`);
  }
  return out.join('');
}

function stainedGlass(rnd: () => number, pal: string[], level: Level): string {
  const out: string[] = [];
  const pick = () => pal[Math.floor(rnd() * pal.length)];
  out.push(`<rect x="0" y="0" width="1000" height="1400" fill="${pal[0]}"/>`);
  const cols = level === 1 ? 4 : level === 2 ? 6 : 8, rows = Math.round(cols * 1.4);
  const cw = 1000 / cols, rh = 1400 / rows;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    pts.push([]);
    for (let c = 0; c <= cols; c++) {
      const edge = r === 0 || c === 0 || r === rows || c === cols;
      pts[r].push([c * cw + (edge ? 0 : (rnd() - 0.5) * cw * 0.5), r * rh + (edge ? 0 : (rnd() - 0.5) * rh * 0.5)]);
    }
  }
  const P = (p: [number, number]) => `${f(p[0])},${f(p[1])}`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
    if ((r + c) % 2) { out.push(`<polygon points="${P(a)} ${P(b)} ${P(e)}" fill="${pick()}"/>`, `<polygon points="${P(a)} ${P(e)} ${P(d)}" fill="${pick()}"/>`); }
    else { out.push(`<polygon points="${P(a)} ${P(b)} ${P(d)}" fill="${pick()}"/>`, `<polygon points="${P(b)} ${P(e)} ${P(d)}" fill="${pick()}"/>`); }
  }
  // a big rose window in the middle
  const cx = 500, cy = 620, n = level === 1 ? 8 : 12;
  out.push(`<circle cx="${cx}" cy="${cy}" r="300" fill="${pal[1]}"/>`);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const p = (ang: number, rad: number) => `${f(cx + Math.cos(ang) * rad)},${f(cy + Math.sin(ang) * rad)}`;
    out.push(`<polygon points="${p(a0, 120)} ${p(a0, 280)} ${p((a0 + a1) / 2, 290)} ${p(a1, 280)} ${p(a1, 120)}" fill="${pal[(k % 2) + 2]}"/>`);
  }
  out.push(`<circle cx="${cx}" cy="${cy}" r="110" fill="${pal[4 % pal.length]}"/>`, `<circle cx="${cx}" cy="${cy}" r="50" fill="${pal[5 % pal.length]}"/>`);
  return out.join('');
}

/** A flat-shape SVG for the idea, made on the device. */
export function proceduralSvg(idea: string, level: Level, colors: number, style?: ArtStyle): string {
  const rnd = seeded(idea + '|' + level + '|' + colors + '|' + (style ?? ''));
  const pal = palette(idea, colors, rnd);
  const kind = style === 'mandala' || /מנדלה|סימטר/.test(idea) ? 'mandala'
    : style === 'stainedglass' || /ויטראז|זכוכית|פסיפס|חלון/.test(idea) ? 'glass'
    : style === 'botanical' || /פרח|גן|פרפר|אביב|שדה/.test(idea) ? 'garden'
    : (['mandala', 'garden', 'glass'] as const)[Math.floor(rnd() * 3)];
  const body = kind === 'mandala' ? mandala(rnd, pal, level) : kind === 'garden' ? garden(rnd, pal, level) : stainedGlass(rnd, pal, level);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400">${body}</svg>`;
}

const TWISTS = ['בגן הקסום', 'תחת אור הירח', 'בבוקר של אביב', 'בשלג הראשון', 'בשקיעה זהובה', 'בארמון הזכוכית', 'בין הכוכבים', 'ליד המזרקה', 'במסיבת התה', 'ביער המכושף', 'על גבי ענן', 'בחלון הוויטראז׳', 'בסגנון מנדלה', 'בשדה הפרחים', 'בליל הפנסים', 'בתוך ספר אגדות'];
/** Page titles for a themed book without any AI: the theme in different scenes. */
export function localTitles(theme: string, count: number): string[] {
  const rnd = seeded(theme);
  const t = TWISTS.slice().sort(() => rnd() - 0.5);
  return Array.from({ length: count }, (_, i) => `${theme} ${t[i % t.length]}`);
}
