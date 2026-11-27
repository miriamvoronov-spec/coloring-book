/** Extra logo designs she can choose from in Settings (the open book stays the default). */

const star = (x: number, y: number, r: number, cls = '') =>
  `<path class="logo-star ${cls}" d="M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r}Z"/>`;

const GOLD = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".5" stop-color="#f0c766"/><stop offset="1" stop-color="#b98a33"/></linearGradient>`;

/** A round gold medallion: crown, crossed pencil and brush, a ring of stars. */
export function logoMedallion(size: number, label: string): string {
  const ring = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `<circle cx="${(120 + Math.cos(a) * 88).toFixed(1)}" cy="${(124 + Math.sin(a) * 88).toFixed(1)}" r="2.2"/>`;
  }).join('');
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lm-gold')}
    <radialGradient id="lm-face" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#34489a"/><stop offset="1" stop-color="#141c44"/></radialGradient>
    <radialGradient id="lm-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffdf92" stop-opacity=".35"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="124" r="116" fill="url(#lm-glow)"/>
  <circle cx="120" cy="124" r="100" fill="url(#lm-face)" stroke="url(#lm-gold)" stroke-width="6"/>
  <circle cx="120" cy="124" r="92" fill="none" stroke="#e9c46a" stroke-width="1" opacity=".6"/>
  <g fill="#e9c46a" opacity=".85">${ring}</g>
  <!-- crown -->
  <path d="M92 66 L100 44 L110 58 L120 38 L130 58 L140 44 L148 66 Z" fill="url(#lm-gold)" stroke="#9a6d22" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="120" cy="36" r="3.4" fill="#fff4c8"/><circle cx="100" cy="42" r="2.6" fill="#fff4c8"/><circle cx="140" cy="42" r="2.6" fill="#fff4c8"/>
  <!-- crossed pencil and brush -->
  <g transform="translate(120 132) rotate(-40)">
    <rect x="-52" y="-6" width="80" height="12" rx="2" fill="#9d7ae6" stroke="#5a3ea8" stroke-width="1"/>
    <rect x="28" y="-6" width="8" height="12" fill="url(#lm-gold)"/>
    <path d="M-52 -6 L-68 0 L-52 6 Z" fill="#f3d9a4"/><path d="M-62 -2.3 L-68 0 L-62 2.3 Z" fill="#7a55d0"/>
  </g>
  <g transform="translate(120 132) rotate(40)">
    <rect x="-36" y="-4" width="74" height="8" rx="4" fill="#c0703a" stroke="#7a3f1e" stroke-width="1"/>
    <rect x="-48" y="-5.5" width="14" height="11" fill="url(#lm-gold)"/>
    <path d="M-48 -5.5 C -60 -6, -70 -2, -76 0 C -70 2, -60 6, -48 5.5 Z" fill="#ef6f8f"/>
  </g>
  <g fill="url(#lm-gold)">${star(82, 178, 7, 's1')}${star(158, 178, 7, 's3')}${star(120, 194, 9, 's2')}</g>
</svg>`;
}

/** An artist's palette with bright paint, and a pencil writing a trail of stars. */
export function logoPalette(size: number, label: string): string {
  const paints = [['#ef476f', 70, 100], ['#ffd166', 100, 82], ['#06d6a0', 136, 80], ['#118ab2', 168, 94], ['#9d7ae6', 176, 128], ['#f78c6b', 60, 136]];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lp-gold')}
    <linearGradient id="lp-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3dc"/><stop offset="1" stop-color="#e6c896"/></linearGradient>
    <radialGradient id="lp-glow" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#ffdf92" stop-opacity=".35"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="120" cy="128" rx="114" ry="100" fill="url(#lp-glow)"/>
  <ellipse cx="120" cy="206" rx="80" ry="8" fill="#000" opacity=".25"/>
  <path d="M120 54 C 178 52, 214 92, 206 136 C 200 170, 168 196, 126 196 C 104 196, 98 182, 106 170 C 114 158, 108 146, 94 150 C 76 156, 64 172, 46 164 C 26 154, 28 112, 50 88 C 68 66, 92 55, 120 54 Z" fill="url(#lp-wood)" stroke="url(#lp-gold)" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="80" cy="150" rx="11" ry="9" fill="#2b1a10" opacity=".85"/>
  ${paints.map(([c, x, y]) => `<path d="M${x} ${(y as number) - 12} c 9 0 14 6 13 12 c -1 8 -8 12 -14 11 c -8 -1 -13 -7 -11 -13 c 1 -6 6 -10 12 -10 Z" fill="${c}" stroke="rgba(0,0,0,.18)"/>`).join('')}
  <g transform="translate(134 160) rotate(-48)">
    <path d="M0 0 L12 -5.5 L12 5.5 Z" fill="#f3d9a4"/><path d="M0 0 L5 -2.3 L5 2.3 Z" fill="#7a55d0"/>
    <rect x="12" y="-5.5" width="66" height="11" fill="#9d7ae6" stroke="#5a3ea8" stroke-width=".8"/>
    <rect x="78" y="-5.5" width="7" height="11" fill="url(#lp-gold)"/><rect x="85" y="-5.5" width="6" height="11" rx="2" fill="#6f4fc2"/>
  </g>
  <g fill="url(#lp-gold)" stroke="#b07a26" stroke-width=".5">${star(120, 140, 5, 's1')}${star(104, 124, 4, 's2')}${star(196, 44, 9, 's3')}${star(214, 70, 5, 's4')}${star(30, 52, 6, 's2')}</g>
</svg>`;
}

/** A golden crescent moon, a pencil drawing stars, and a small open book below. */
export function logoMoon(size: number, label: string): string {
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lo-gold')}
    <radialGradient id="lo-glow" cx=".45" cy=".4" r=".55"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".45"/><stop offset="1" stop-color="#ffe6a6" stop-opacity="0"/></radialGradient>
    <linearGradient id="lo-page" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbf1dc"/><stop offset="1" stop-color="#fffaf0"/></linearGradient>
  </defs>
  <circle cx="110" cy="100" r="104" fill="url(#lo-glow)"/>
  <path d="M138 28 A 74 74 0 1 0 186 152 A 60 60 0 1 1 138 28 Z" fill="url(#lo-gold)" stroke="#a87a2a" stroke-width="1.5"/>
  <g transform="translate(142 108) rotate(-30)">
    <path d="M0 0 L12 -5.5 L12 5.5 Z" fill="#f3d9a4"/><path d="M0 0 L5 -2.3 L5 2.3 Z" fill="#ef476f"/>
    <rect x="12" y="-5.5" width="58" height="11" fill="#ef6f8f" stroke="#a3304f" stroke-width=".8"/>
    <rect x="70" y="-5.5" width="7" height="11" fill="url(#lo-gold)"/><rect x="77" y="-5.5" width="6" height="11" rx="2" fill="#a3304f"/>
  </g>
  <g fill="url(#lo-gold)" stroke="#b07a26" stroke-width=".5">${star(132, 120, 5, 's1')}${star(118, 138, 6, 's2')}${star(100, 152, 4, 's3')}${star(196, 36, 8, 's4')}${star(214, 92, 5, 's1')}</g>
  <ellipse cx="120" cy="214" rx="70" ry="6" fill="#000" opacity=".25"/>
  <path d="M120 210 C 100 198, 70 196, 46 202 L 46 168 C 70 162, 100 164, 120 176 Z" fill="url(#lo-page)" stroke="url(#lo-gold)" stroke-width="2"/>
  <path d="M120 210 C 140 198, 170 196, 194 202 L 194 168 C 170 162, 140 164, 120 176 Z" fill="url(#lo-page)" stroke="url(#lo-gold)" stroke-width="2"/>
  <path d="M120 176 V 210" stroke="#c9a36a" stroke-width="1.4"/>
</svg>`;
}

/** The palette and the open coloring book together: paint from the palette runs as a sparkle trail onto coloured pages. */
export function logoPaletteBook(size: number, label: string): string {
  const paints = [['#ef476f', 64, 60], ['#ffd166', 92, 44], ['#06d6a0', 124, 40], ['#118ab2', 154, 50], ['#9d7ae6', 168, 76]];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lb-gold')}
    <linearGradient id="lb-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3dc"/><stop offset="1" stop-color="#e6c896"/></linearGradient>
    <linearGradient id="lb-cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4a2a"/><stop offset="1" stop-color="#5a2c16"/></linearGradient>
    <linearGradient id="lb-pageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6e7c8"/><stop offset=".85" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6cfa4"/></linearGradient>
    <linearGradient id="lb-pageR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f6e7c8"/><stop offset=".85" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6cfa4"/></linearGradient>
    <radialGradient id="lb-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffdf92" stop-opacity=".4"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/></radialGradient>
    <clipPath id="lb-left"><path d="M120 196 C 98 184, 66 182, 40 188 L 40 128 C 66 122, 98 124, 120 136 Z"/></clipPath>
  </defs>
  <ellipse cx="120" cy="120" rx="116" ry="110" fill="url(#lb-glow)"/>
  <!-- the palette, above the book -->
  <path d="M112 22 C 160 20, 194 46, 190 78 C 187 100, 164 112, 134 110 C 118 109, 114 100, 120 92 C 126 84, 120 76, 108 79 C 92 83, 80 96, 62 90 C 42 83, 40 58, 58 42 C 72 30, 90 23, 112 22 Z" fill="url(#lb-wood)" stroke="url(#lb-gold)" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="78" cy="78" rx="8" ry="6.5" fill="#2b1a10" opacity=".8"/>
  ${paints.map(([c, x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}" stroke="rgba(0,0,0,.18)"/>`).join('')}
  <!-- the brush dips in the palette and paints a sparkle trail onto the page -->
  <path d="M150 92 C 150 116, 128 122, 104 140" fill="none" stroke="url(#lb-gold)" stroke-width="2.5" stroke-dasharray="2 6" stroke-linecap="round"/>
  <g transform="translate(150 90) rotate(-62)">
    <path d="M0 0 C 4 -5, 10 -5, 13 -3 L 13 3 C 10 5, 4 5, 0 0 Z" fill="#ef476f"/>
    <rect x="13" y="-3.5" width="8" height="7" fill="url(#lb-gold)"/>
    <rect x="21" y="-3" width="46" height="6" rx="3" fill="#6f4fc2"/>
  </g>
  <!-- the book: leather cover, gilded edges, a coloured picture on the left page -->
  <ellipse cx="120" cy="214" rx="90" ry="7" fill="#000" opacity=".28"/>
  <path d="M120 206 C 92 194, 56 192, 26 198 L 26 132 C 56 126, 92 128, 120 140 C 148 128, 184 126, 214 132 L 214 198 C 184 192, 148 194, 120 206 Z" fill="url(#lb-cover)" stroke="url(#lb-gold)" stroke-width="2.5"/>
  <path d="M120 200 C 96 188, 64 186, 34 192 L 34 132" fill="none" stroke="#e9c46a" stroke-width="1.6" opacity=".8"/>
  <path d="M120 200 C 144 188, 176 186, 206 192 L 206 132" fill="none" stroke="#e9c46a" stroke-width="1.6" opacity=".8"/>
  <path d="M120 196 C 98 184, 66 182, 40 188 L 40 128 C 66 122, 98 124, 120 136 Z" fill="url(#lb-pageL)" stroke="#c9a36a" stroke-width="1.2"/>
  <path d="M120 196 C 142 184, 174 182, 200 188 L 200 128 C 174 122, 142 124, 120 136 Z" fill="url(#lb-pageR)" stroke="#c9a36a" stroke-width="1.2"/>
  <g clip-path="url(#lb-left)" stroke="#2b1a10" stroke-width="1.3" stroke-linejoin="round">
    <path d="M40 170 C 60 160, 90 162, 120 176 L 120 200 L 40 200 Z" fill="#9bd770"/>
    <circle cx="62" cy="144" r="8" fill="#ffd23f"/>
    <path d="M92 160 C 84 150, 86 140, 94 140 C 98 140, 100 144, 100 146 C 100 144, 102 140, 106 140 C 114 140, 116 150, 108 160 L 100 168 Z" fill="#ef476f"/>
    <path d="M100 168 V 182" fill="none" stroke="#3a9d5d" stroke-width="2"/>
  </g>
  <g stroke="#2b1a10" stroke-width="1.1" fill="none" opacity=".75">
    <path d="M136 152 C 150 146, 170 146, 186 150"/><path d="M136 162 C 150 156, 170 156, 186 160"/>
    <circle cx="164" cy="176" r="9"/><path d="M150 186 C 158 182, 172 182, 180 186"/>
  </g>
  <path d="M120 136 V 206" stroke="#a87a3a" stroke-width="1.4"/>
  <g fill="url(#lb-gold)" stroke="#b07a26" stroke-width=".5">${star(104, 140, 5, 's1')}${star(122, 122, 4, 's2')}${star(138, 110, 4, 's3')}${star(206, 30, 8, 's4')}${star(222, 58, 5, 's1')}${star(24, 104, 6, 's2')}</g>
</svg>`;
}
