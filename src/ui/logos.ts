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

/** An open coloring book, half coloured by numbers, with the palette resting diagonally on its side. */
export function logoPaletteBook(size: number, label: string): string {
  const paints = [['#ef476f', -34, -8], ['#ffd166', -14, -20], ['#06d6a0', 8, -22], ['#118ab2', 28, -12], ['#9d7ae6', 36, 8]];
  const num = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" font-size="7.5" font-weight="700" font-family="Fredoka, sans-serif" fill="#3a2a1a" text-anchor="middle" dominant-baseline="central">${t}</text>`;
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lb-gold')}
    <linearGradient id="lb-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3dc"/><stop offset="1" stop-color="#e2c08a"/></linearGradient>
    <linearGradient id="lb-cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4a2a"/><stop offset="1" stop-color="#5a2c16"/></linearGradient>
    <linearGradient id="lb-pageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6e7c8"/><stop offset=".85" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6cfa4"/></linearGradient>
    <linearGradient id="lb-pageR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f6e7c8"/><stop offset=".85" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6cfa4"/></linearGradient>
    <radialGradient id="lb-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffdf92" stop-opacity=".4"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/></radialGradient>
    <clipPath id="lb-left"><path d="M120 186 C 96 172, 60 170, 28 176 L 28 92 C 60 86, 96 88, 120 102 Z"/></clipPath>
    <clipPath id="lb-right"><path d="M120 186 C 144 172, 180 170, 212 176 L 212 92 C 180 86, 144 88, 120 102 Z"/></clipPath>
  </defs>
  <ellipse cx="120" cy="124" rx="116" ry="108" fill="url(#lb-glow)"/>
  <ellipse cx="120" cy="206" rx="96" ry="7" fill="#000" opacity=".28"/>
  <!-- the open book -->
  <path d="M120 196 C 90 182, 52 180, 18 186 L 18 96 C 52 90, 90 92, 120 106 C 150 92, 188 90, 222 96 L 222 186 C 188 180, 150 182, 120 196 Z" fill="url(#lb-cover)" stroke="url(#lb-gold)" stroke-width="2.5"/>
  <path d="M120 186 C 96 172, 60 170, 28 176 L 28 92 C 60 86, 96 88, 120 102 Z" fill="url(#lb-pageL)" stroke="#c9a36a" stroke-width="1.2"/>
  <path d="M120 186 C 144 172, 180 170, 212 176 L 212 92 C 180 86, 144 88, 120 102 Z" fill="url(#lb-pageR)" stroke="#c9a36a" stroke-width="1.2"/>
  <!-- left page: a flower picture, partly coloured by its numbers -->
  <g clip-path="url(#lb-left)" stroke="#2b1a10" stroke-width="1.2" stroke-linejoin="round" fill="none">
    <path d="M28 160 C 50 150, 90 152, 120 166"/>
    <path d="M28 160 C 50 150, 90 152, 120 166 L 120 190 L 28 190 Z" fill="#9bd770"/>
    <circle cx="74" cy="118" r="9" fill="#ffd23f"/>
    <path d="M74 109 C 66 96, 82 92, 80 108" fill="#ef476f"/><path d="M83 115 C 96 106, 100 122, 84 122" fill="#ef476f"/>
    <path d="M80 126 C 88 140, 72 142, 72 127"/><path d="M65 122 C 52 128, 50 112, 65 113"/><path d="M68 110 C 58 100, 70 94, 72 109"/>
    <path d="M74 127 V 158" stroke="#3a9d5d" stroke-width="2"/><path d="M74 146 C 84 138, 92 142, 88 148 C 84 152, 78 150, 74 146 Z" fill="#9bd770"/>
    <path d="M40 104 C 44 98, 54 98, 56 104 C 60 102, 64 108, 58 110 H 42 C 36 110, 36 104, 40 104 Z"/>
    <path d="M96 108 C 98 102, 108 100, 110 106 C 114 106, 114 112, 110 112 H 98 C 94 112, 94 108, 96 108 Z" fill="#bfe3ff"/>
  </g>
  <g clip-path="url(#lb-left)">${num(48, 105, '2')}${num(68, 130, '3')}${num(100, 176, '1')}${num(103, 107, '2')}</g>
  <!-- right page: still to colour, only lines and numbers -->
  <g clip-path="url(#lb-right)" stroke="#2b1a10" stroke-width="1.1" fill="none" opacity=".85">
    <path d="M120 150 C 140 138, 170 136, 212 146"/><path d="M134 120 L 146 104 L 158 120 Z"/><path d="M136 120 H 156 V 140 H 136 Z"/>
    <circle cx="186" cy="114" r="10"/>
  </g>
  <g clip-path="url(#lb-right)">${num(146, 130, '4')}${num(186, 114, '5')}${num(172, 164, '1')}${num(146, 114, '6')}</g>
  <path d="M120 106 V 196" stroke="#a87a3a" stroke-width="1.4"/>
  <!-- the palette, resting diagonally on the right side of the book -->
  <g transform="translate(178 86) rotate(-28)">
    <path d="M-6 -36 C 30 -38, 56 -18, 52 6 C 50 22, 34 30, 12 30 C 0 30, -4 22, 0 16 C 4 10, 0 4, -10 6 C -22 8, -30 18, -44 14 C -60 9, -62 -8, -50 -20 C -40 -30, -24 -35, -6 -36 Z" fill="url(#lb-wood)" stroke="url(#lb-gold)" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="-20" cy="2" rx="6.5" ry="5" fill="#5a2c16" opacity=".85"/>
    ${paints.map(([c, x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" fill="${c}" stroke="rgba(0,0,0,.18)"/>`).join('')}
    <g transform="translate(10 18) rotate(-35)"><path d="M0 0 C 3 -4, 8 -4, 10 -2 L 10 2 C 8 4, 3 4, 0 0 Z" fill="#ef476f"/><rect x="10" y="-2.8" width="7" height="5.6" fill="url(#lb-gold)"/><rect x="17" y="-2.4" width="40" height="4.8" rx="2.4" fill="#6f4fc2"/></g>
  </g>
  <!-- sparkles from the brush to the page -->
  <path d="M150 112 C 134 118, 118 120, 104 128" fill="none" stroke="url(#lb-gold)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>
  <g fill="url(#lb-gold)" stroke="#b07a26" stroke-width=".5">${star(108, 126, 5, 's1')}${star(128, 116, 4, 's2')}${star(30, 52, 7, 's3')}${star(60, 30, 5, 's4')}${star(214, 196, 5, 's1')}</g>
</svg>`;
}

/** A fairy-tale castle on an open book, with a rainbow of colour arching over it. */
export function logoCastle(size: number, label: string): string {
  const bands = ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#9d7ae6'];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lc-gold')}
    <linearGradient id="lc-page" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6e7c8"/><stop offset=".5" stop-color="#fffaf0"/><stop offset="1" stop-color="#f6e7c8"/></linearGradient>
    <radialGradient id="lc-glow" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".4"/><stop offset="1" stop-color="#ffe6a6" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="120" r="112" fill="url(#lc-glow)"/>
  ${bands.map((c, i) => `<path d="M${40 + i * 7} 150 A ${80 - i * 7} ${80 - i * 7} 0 0 1 ${200 - i * 7} 150" fill="none" stroke="${c}" stroke-width="7" opacity=".9"/>`).join('')}
  <g stroke="#7a5420" stroke-width="1.4" stroke-linejoin="round">
    <rect x="92" y="104" width="56" height="54" fill="#fff3dc"/>
    <rect x="80" y="92" width="18" height="66" fill="#f9e7c4"/><rect x="142" y="92" width="18" height="66" fill="#f9e7c4"/>
    <path d="M78 92 L89 66 L100 92 Z" fill="#9d7ae6"/><path d="M140 92 L151 66 L162 92 Z" fill="#9d7ae6"/>
    <rect x="108" y="84" width="24" height="24" fill="#f9e7c4"/><path d="M106 84 L120 52 L134 84 Z" fill="#ef476f"/>
    <path d="M112 158 V 140 A 8 8 0 0 1 128 140 V 158 Z" fill="#b07a26"/>
  </g>
  <path d="M120 52 V 40 L 132 44 L 120 48" fill="url(#lc-gold)" stroke="#a87a2a" stroke-width="1"/>
  <ellipse cx="120" cy="214" rx="86" ry="7" fill="#000" opacity=".28"/>
  <path d="M120 210 C 96 198, 62 196, 32 202 L 32 160 C 62 154, 96 156, 120 168 Z" fill="url(#lc-page)" stroke="url(#lc-gold)" stroke-width="2.5"/>
  <path d="M120 210 C 144 198, 178 196, 208 202 L 208 160 C 178 154, 144 156, 120 168 Z" fill="url(#lc-page)" stroke="url(#lc-gold)" stroke-width="2.5"/>
  <path d="M120 168 V 210" stroke="#c9a36a" stroke-width="1.4"/>
  <g fill="url(#lc-gold)" stroke="#b07a26" stroke-width=".5">${star(40, 60, 7, 's1')}${star(204, 52, 8, 's2')}${star(190, 112, 4, 's3')}${star(52, 116, 4, 's4')}</g>
</svg>`;
}

/** A heart-shaped palette with two crossed brushes and a gold ribbon. */
export function logoHeart(size: number, label: string): string {
  const paints = [['#ef476f', 92, 92], ['#ffd166', 120, 80], ['#06d6a0', 148, 92], ['#118ab2', 150, 122], ['#9d7ae6', 90, 122]];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lh-gold')}
    <linearGradient id="lh-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3dc"/><stop offset="1" stop-color="#e6c896"/></linearGradient>
    <radialGradient id="lh-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc6d6" stop-opacity=".45"/><stop offset="1" stop-color="#ffc6d6" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="118" r="112" fill="url(#lh-glow)"/>
  <g transform="translate(120 120) rotate(-40)"><rect x="-4" y="-98" width="8" height="150" rx="4" fill="#6f4fc2"/><rect x="-5" y="-106" width="10" height="12" fill="url(#lh-gold)"/><path d="M-5 -106 C -5 -122, 5 -122, 5 -106 Z" fill="#ef476f"/></g>
  <g transform="translate(120 120) rotate(40)"><rect x="-4" y="-98" width="8" height="150" rx="4" fill="#118ab2"/><rect x="-5" y="-106" width="10" height="12" fill="url(#lh-gold)"/><path d="M-5 -106 C -5 -122, 5 -122, 5 -106 Z" fill="#ffd166"/></g>
  <path d="M120 190 C 60 150, 40 112, 56 80 C 72 50, 108 54, 120 80 C 132 54, 168 50, 184 80 C 200 112, 180 150, 120 190 Z" fill="url(#lh-wood)" stroke="url(#lh-gold)" stroke-width="4"/>
  <ellipse cx="120" cy="150" rx="9" ry="7" fill="#2b1a10" opacity=".8"/>
  ${paints.map(([c, x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${c}" stroke="rgba(0,0,0,.18)"/>`).join('')}
  <path d="M56 200 C 90 186, 150 186, 184 200 L 176 214 C 146 204, 94 204, 64 214 Z" fill="url(#lh-gold)" stroke="#a87a2a" stroke-width="1"/>
  <g fill="url(#lh-gold)" stroke="#b07a26" stroke-width=".5">${star(36, 46, 7, 's1')}${star(206, 40, 8, 's2')}${star(214, 150, 5, 's3')}${star(24, 156, 5, 's4')}</g>
</svg>`;
}

/** A crown of crayons resting on a closed gilded book. */
export function logoCrown(size: number, label: string): string {
  const cr = ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#9d7ae6', '#ef476f'];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lk-gold')}
    <linearGradient id="lk-cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3f86"/><stop offset="1" stop-color="#18234f"/></linearGradient>
    <radialGradient id="lk-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".4"/><stop offset="1" stop-color="#ffe6a6" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="116" r="112" fill="url(#lk-glow)"/>
  ${cr.map((c, i) => { const x = 66 + i * 18; const tall = i % 2 ? 52 : 70; return `<g><rect x="${x}" y="${132 - tall}" width="14" height="${tall}" fill="${c}" stroke="rgba(0,0,0,.25)"/><path d="M${x} ${132 - tall} L ${x + 7} ${118 - tall} L ${x + 14} ${132 - tall} Z" fill="#f3d9a4"/><path d="M${x + 4} ${125 - tall} L ${x + 7} ${118 - tall} L ${x + 10} ${125 - tall} Z" fill="${c}"/></g>`; }).join('')}
  <rect x="60" y="126" width="120" height="16" rx="3" fill="url(#lk-gold)" stroke="#a87a2a"/>
  <circle cx="90" cy="134" r="3.5" fill="#ef476f"/><circle cx="120" cy="134" r="4" fill="#118ab2"/><circle cx="150" cy="134" r="3.5" fill="#06d6a0"/>
  <ellipse cx="120" cy="212" rx="84" ry="7" fill="#000" opacity=".28"/>
  <path d="M40 150 H 200 L 206 196 H 34 Z" fill="url(#lk-cover)" stroke="url(#lk-gold)" stroke-width="3"/>
  <path d="M38 196 H 202 V 206 H 38 Z" fill="#fff6e2" stroke="#c9a36a"/>
  <path d="M52 160 H 188 L 192 188 H 48 Z" fill="none" stroke="url(#lk-gold)" stroke-width="1.5"/>
  <g fill="url(#lk-gold)" stroke="#b07a26" stroke-width=".5">${star(120, 174, 7, 's1')}${star(36, 60, 7, 's2')}${star(206, 52, 8, 's3')}${star(214, 110, 4, 's4')}</g>
</svg>`;
}

/** A rainbow arching out of an open coloring book, a cloud at each end. */
export function logoRainbow(size: number, label: string): string {
  const bands = ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#9d7ae6'];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lr-gold')}
    <radialGradient id="lr-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff0c0" stop-opacity=".45"/><stop offset="1" stop-color="#fff0c0" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="116" r="112" fill="url(#lr-glow)"/>
  ${bands.map((c, i) => `<path d="M${44 + i * 7} 150 A ${76 - i * 7} ${76 - i * 7} 0 0 1 ${196 - i * 7} 150" fill="none" stroke="${c}" stroke-width="7.5"/>`).join('')}
  <g fill="#fffaf0" stroke="#d9c3a0" stroke-width="1.5"><path d="M30 152 a14 14 0 0 1 20 -14 a16 16 0 0 1 28 6 a11 11 0 0 1 2 22 H36 a10 10 0 0 1 -6 -14 Z"/><path d="M160 152 a14 14 0 0 1 20 -14 a16 16 0 0 1 28 6 a11 11 0 0 1 2 22 H166 a10 10 0 0 1 -6 -14 Z"/></g>
  <ellipse cx="120" cy="212" rx="86" ry="7" fill="#000" opacity=".25"/>
  <path d="M120 176 C 96 166, 62 166, 34 174 V 206 C 62 198, 96 198, 120 208 Z" fill="#fffaf0" stroke="url(#lr-gold)" stroke-width="3"/>
  <path d="M120 176 C 144 166, 178 166, 206 174 V 206 C 178 198, 144 198, 120 208 Z" fill="#fff4e0" stroke="url(#lr-gold)" stroke-width="3"/>
  <path d="M50 186 q14 -6 28 0 M58 196 q10 -4 20 0" stroke="#3b2a1e" stroke-width="1.5" fill="none"/>
  <text x="160" y="194" font-size="11" font-weight="700" font-family="Fredoka, sans-serif" fill="#3b2a1e" text-anchor="middle">3</text>
  <g fill="url(#lr-gold)" stroke="#b07a26" stroke-width=".5">${star(120, 40, 9, 's1')}${star(40, 70, 6, 's2')}${star(204, 76, 7, 's3')}${star(120, 120, 5, 's4')}</g>
</svg>`;
}

/** A paintbrush painting a swirl of colour, ending in a star. */
export function logoBrush(size: number, label: string): string {
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lb-gold')}
    <linearGradient id="lb-swirl" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9d7ae6"/><stop offset=".35" stop-color="#ef476f"/><stop offset=".7" stop-color="#ffd166"/><stop offset="1" stop-color="#06d6a0"/></linearGradient>
    <radialGradient id="lb-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9f0" stop-opacity=".4"/><stop offset="1" stop-color="#ffd9f0" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="120" r="112" fill="url(#lb-glow)"/>
  <path d="M60 186 C 30 140, 70 92, 116 108 C 156 122, 150 170, 118 166 C 92 162, 100 128, 132 124 C 170 120, 190 86, 176 52" fill="none" stroke="url(#lb-swirl)" stroke-width="14" stroke-linecap="round"/>
  <g transform="translate(176 52)" fill="url(#lb-gold)" stroke="#b07a26" stroke-width=".8">${star(0, -8, 14, 'sb')}</g>
  <g transform="translate(60 186) rotate(35)">
    <rect x="-6" y="0" width="12" height="54" rx="5" fill="#7a4a24"/>
    <rect x="-7" y="-14" width="14" height="16" fill="url(#lb-gold)" stroke="#a87a2a"/>
    <path d="M-7 -14 C -9 -30, -2 -40, 0 -44 C 2 -40, 9 -30, 7 -14 Z" fill="#9d7ae6"/>
  </g>
  <g fill="url(#lb-gold)" stroke="#b07a26" stroke-width=".5">${star(40, 50, 7, 's1')}${star(210, 140, 6, 's2')}${star(150, 210, 5, 's3')}</g>
</svg>`;
}

/** A cup full of coloured pencils with sparkles rising out of it. */
export function logoPencilCup(size: number, label: string): string {
  const pens = [['#ef476f', 74, -16], ['#ffd166', 92, -6], ['#06d6a0', 112, 0], ['#118ab2', 130, 6], ['#9d7ae6', 148, 14], ['#f78c6b', 164, 22]];
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lc-gold')}
    <linearGradient id="lc-cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2d3f86"/><stop offset=".5" stop-color="#3e56b0"/><stop offset="1" stop-color="#18234f"/></linearGradient>
    <radialGradient id="lc-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".4"/><stop offset="1" stop-color="#ffe6a6" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="116" r="112" fill="url(#lc-glow)"/>
  ${pens.map(([c, x, r]) => `<g transform="translate(${x} 130) rotate(${r})"><rect x="-6" y="-92" width="12" height="96" fill="${c}" stroke="rgba(0,0,0,.25)"/><path d="M-6 -92 L 0 -110 L 6 -92 Z" fill="#f3d9a4"/><path d="M-2.5 -102 L 0 -110 L 2.5 -102 Z" fill="${c}"/></g>`).join('')}
  <ellipse cx="120" cy="212" rx="64" ry="7" fill="#000" opacity=".28"/>
  <path d="M68 124 H 172 L 162 208 H 78 Z" fill="url(#lc-cup)" stroke="url(#lc-gold)" stroke-width="3"/>
  <path d="M66 120 H 174 V 132 H 66 Z" fill="url(#lc-gold)" stroke="#a87a2a"/>
  <g fill="url(#lc-gold)" stroke="#b07a26" stroke-width=".5">${star(120, 170, 12, 's0')}${star(46, 54, 7, 's1')}${star(196, 40, 8, 's2')}${star(210, 120, 5, 's3')}</g>
</svg>`;
}

/** A butterfly with coloured, numbered wings resting on an open book. */
export function logoButterfly(size: number, label: string): string {
  const num = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" font-size="9" font-weight="700" font-family="Fredoka, sans-serif" fill="#3a2a1a" text-anchor="middle" dominant-baseline="central">${t}</text>`;
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>${GOLD('lf-gold')}
    <radialGradient id="lf-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d8f3ff" stop-opacity=".4"/><stop offset="1" stop-color="#d8f3ff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="120" cy="112" r="112" fill="url(#lf-glow)"/>
  <ellipse cx="120" cy="214" rx="86" ry="7" fill="#000" opacity=".25"/>
  <path d="M120 168 C 94 156, 60 156, 32 164 V 204 C 60 196, 94 196, 120 208 Z" fill="#fffaf0" stroke="url(#lf-gold)" stroke-width="3"/>
  <path d="M120 168 C 146 156, 180 156, 208 164 V 204 C 180 196, 146 196, 120 208 Z" fill="#fff4e0" stroke="url(#lf-gold)" stroke-width="3"/>
  <g stroke="#2b1a10" stroke-width="2.2">
    <path d="M118 100 C 90 50, 40 60, 52 100 C 58 120, 92 122, 118 108 Z" fill="#ef476f"/>
    <path d="M118 112 C 88 118, 64 140, 82 154 C 98 166, 114 140, 118 118 Z" fill="none"/>
    <path d="M122 100 C 150 50, 200 60, 188 100 C 182 120, 148 122, 122 108 Z" fill="#118ab2"/>
    <path d="M122 112 C 152 118, 176 140, 158 154 C 142 166, 126 140, 122 118 Z" fill="#ffd166"/>
    <path d="M120 94 V 150" stroke-width="5" stroke-linecap="round"/>
    <path d="M120 94 C 114 78, 104 72, 98 70 M120 94 C 126 78, 136 72, 142 70" fill="none"/>
  </g>
  ${num(96, 140, '4')}
  <g fill="url(#lf-gold)" stroke="#b07a26" stroke-width=".5">${star(40, 40, 7, 's1')}${star(204, 36, 8, 's2')}${star(214, 130, 5, 's3')}${star(26, 134, 5, 's4')}</g>
</svg>`;
}
